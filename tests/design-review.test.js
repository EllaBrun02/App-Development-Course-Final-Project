// Regression tests for PR #5. Uses a unique, disposable MongoDB database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const ejs = require('ejs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Article = require('../models/Article');

const uri = `mongodb://127.0.0.1:27017/design_review_${process.pid}_${Date.now()}`;
const port = Number(process.env.TEST_PORT || 3198);
let server, editorCookie, reporterCookie, reporter;
const fields = { title: 'Original title', summary: 'Original summary', content: 'First line\nSecond line', image: '', category: 'Technology' };

async function request(url, { method = 'GET', body, cookie = editorCookie } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${url}`, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
}
async function makeArticle(extra = {}) {
  return Article.create({ ...fields, author: reporter._id, ...extra });
}
async function publishedUpdate() {
  return makeArticle({ status: 'published', pendingUpdate: { ...fields, title: 'Proposed title', status: 'pending' } });
}
before(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const passwordHash = await User.hashPassword('test-password');
  const users = await User.create([
    { username: 'editor', name: 'Editor', role: 'editor', passwordHash },
    { username: 'reporter', name: 'Reporter', role: 'reporter', passwordHash },
  ]);
  reporter = users[1];
  server = spawn(process.execPath, ['app.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), MONGO_URI: uri, SESSION_SECRET: 'isolated-review-test' },
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Test server exited during startup');
    try { await request('/login', { cookie: '' }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, 'Test server started');
  for (const username of ['editor', 'reporter']) {
    const response = await request('/login', { method: 'POST', cookie: '', body: { username, password: 'test-password' } });
    assert.equal(response.status, 302);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    if (username === 'editor') editorCookie = cookie;
    else reporterCookie = cookie;
  }
});
after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('review renders untrusted content as text without opening a script element', async () => {
  const a = await publishedUpdate();
  a.pendingUpdate.content = '</script><script>document.body.dataset.injected="yes"</script>';
  await a.save();
  const response = await request(`/editor/articles/${a.id}`);
  assert.equal(response.status, 200);
  assert.ok(!response.text.includes('<script>document.body.dataset.injected'));
  assert.match(response.text, /&lt;\/script&gt;&lt;script&gt;/);
});

test('comparison content and both image choices exist before the optional Diff script loads', async () => {
  const a = await publishedUpdate();
  a.image = 'https://example.com/old.jpg';
  a.pendingUpdate.image = 'https://example.com/new.jpg';
  await a.save();
  const response = await request(`/editor/articles/${a.id}`);
  assert.match(response.text, /id="diff-title-old"[^>]*>Original title<\/div>/);
  assert.match(response.text, /id="diff-title-new"[^>]*>Proposed title<\/div>/);
  assert.match(response.text, /src="https:\/\/example.com\/old.jpg"/);
  assert.match(response.text, /src="https:\/\/example.com\/new.jpg"/);
});

test('ordinary review preserves line breaks without literal br markup', async () => {
  const a = await makeArticle({ status: 'pending' });
  const response = await request(`/editor/articles/${a.id}`);
  assert.match(response.text, /First line\nSecond line/);
  assert.ok(!response.text.includes('First line&lt;br&gt;Second line'));
});

test('public article body cannot create executable HTML', async () => {
  const article = { ...fields, _id: '507f1f77bcf86cd799439011', publishedAt: new Date(), views: 0,
    author: { name: 'Reporter' }, content: '<img src=x onerror="alert(1)">\nNext line' };
  const html = await ejs.renderFile(path.join(__dirname, '../views/article.ejs'), {
    article, comments: [], categories: Article.CATEGORIES,
    weather: { city: 'Tel Aviv', temp: '--', description: 'Unavailable', icon: '', windspeed: '--', fetchedAt: '-' },
    user: null, userRole: null,
  });
  assert.ok(!html.includes('<img src=x onerror='));
  assert.match(html, /&lt;img src=x onerror=/);
});

test('edit page opens the pending version and identifies the edit target', async () => {
  const a = await publishedUpdate();
  const response = await request(`/editor/articles/${a.id}/edit`);
  assert.equal(response.status, 200);
  assert.match(response.text, /value="Proposed title"/);
  assert.match(response.text, /data-edit-target="update"/);
});

test('saving a pending edit leaves the live version unchanged, then approval publishes the corrections', async () => {
  const a = await publishedUpdate();
  const saved = await request(`/editor/articles/${a.id}`, { method: 'PATCH', body: { ...fields, target: 'update', title: 'Editor correction' } });
  assert.equal(saved.status, 200);
  const stored = await Article.findById(a.id);
  assert.equal(stored.title, 'Original title');
  assert.equal(stored.pendingUpdate.title, 'Editor correction');
  assert.equal((await request(`/editor/articles/${a.id}/approve-update`, { method: 'PATCH', body: {} })).status, 200);
  assert.equal((await Article.findById(a.id)).title, 'Editor correction');
});

test('a stale pending editor cannot fall back to overwriting the live article', async () => {
  const a = await publishedUpdate();
  await request(`/editor/articles/${a.id}/approve-update`, { method: 'PATCH', body: {} });
  const response = await request(`/editor/articles/${a.id}`, { method: 'PATCH', body: { ...fields, target: 'update' } });
  assert.equal(response.status, 409);
  assert.equal((await Article.findById(a.id)).title, 'Proposed title');
});

test('an edit cannot silently switch to main while an update awaits review', async () => {
  const a = await publishedUpdate();
  const response = await request(`/editor/articles/${a.id}`, { method: 'PATCH', body: { ...fields, target: 'main', title: 'Wrong version' } });
  assert.equal(response.status, 409);
  assert.equal((await Article.findById(a.id)).title, 'Original title');
});

test('main article editing still works and remains restricted to editors', async () => {
  const a = await makeArticle({ status: 'pending' });
  const denied = await request(`/editor/articles/${a.id}`, { method: 'PATCH', cookie: reporterCookie, body: { ...fields, target: 'main', title: 'Reporter bypass' } });
  assert.equal(denied.status, 403);
  const saved = await request(`/editor/articles/${a.id}`, { method: 'PATCH', body: { ...fields, target: 'main', title: 'Editor main' } });
  assert.equal(saved.status, 200);
  assert.equal((await Article.findById(a.id)).title, 'Editor main');
});

test('editor rejects invalid form values without mutating the article', async () => {
  const a = await makeArticle();
  for (const invalid of [{ title: '   ' }, { summary: {} }, { content: [] }, { image: 'javascript:alert(1)' }, { title: 'x'.repeat(201) }, { category: 'Invalid' }, { target: 'unknown' }]) {
    const response = await request(`/editor/articles/${a.id}`, { method: 'PATCH', body: { ...fields, target: 'main', ...invalid } });
    assert.equal(response.status, 400, JSON.stringify(invalid));
  }
  assert.equal((await Article.findById(a.id)).title, 'Original title');
});
