/**
 * Focused checks for audit findings 19–38 (audit #35: tests must exercise the
 * real behaviour — e.g. the spam test PRESERVES its cookies like a browser).
 *
 * Requirements: a running server with a seeded database.
 *   BASE_URL   (default http://localhost:3000)
 *   EDITOR_USER / EDITOR_PASS (default editor1 / editor123)
 *
 * Run:  node tests/audit-19-38.test.js
 * Note: the spam test posts comments to the first published article.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}

// Minimal cookie jar so requests behave like one browser/device
function makeJar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    absorb(res) {
      // getSetCookie exists from Node 18.14; older 18.x joins all Set-Cookie
      // headers with commas, so fall back to splitting on a comma that starts
      // a new `name=` pair (commas inside Expires dates are not followed by =).
      let set;
      if (res.headers.getSetCookie) {
        set = res.headers.getSetCookie();
      } else {
        const raw = res.headers.get('set-cookie');
        set = raw ? raw.split(/,(?=\s*[^;,\s]+=)/) : [];
      }
      for (const line of set) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    get(name) { return cookies.get(name); },
    delete(name) { cookies.delete(name); },
  };
}

async function request(jar, path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const cookieHeader = jar.header();
  if (cookieHeader) headers.cookie = cookieHeader;
  const res = await fetch(BASE_URL + path, { ...options, headers, redirect: 'manual' });
  jar.absorb(res);
  return res;
}

async function firstPublishedArticleId(jar) {
  const res = await request(jar, '/api/articles?page=1');
  const { articles } = await res.json();
  return articles[0] && articles[0]._id;
}

async function testCommentRateLimit() {
  console.log('\n#19 Comment rate limit (cookie preserved like a real device):');
  const jar = makeJar();
  const articleId = await firstPublishedArticleId(jar);
  check('found a published article to comment on', !!articleId);
  if (!articleId) return;

  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const res = await request(jar, `/article/${articleId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: 'RateLimit Test', body: `Automated rate-limit check #${i + 1}` }),
    });
    statuses.push(res.status);
  }
  check('first 3 comments accepted', statuses.slice(0, 3).every(s => s === 201), `statuses: ${statuses.join(',')}`);
  check('4th comment within a minute is blocked (429)', statuses[3] === 429, `status: ${statuses[3]}`);
  check('device cookie is issued', !!jar.get('_did'));

  // Tampering with the signed cookie must not mint a valid new device
  const original = jar.get('_did');
  if (original) {
    const tampered = original.replace(/.$/, c => (c === 'a' ? 'b' : 'a'));
    const jar2 = makeJar();
    // send a forged cookie; server must reject the signature and still
    // apply its backstop limits rather than trusting the forged identity
    const res = await fetch(BASE_URL + `/article/${articleId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: `_did=${tampered}` },
      body: JSON.stringify({ author: 'RateLimit Test', body: 'Forged cookie check' }),
    });
    jar2.absorb(res);
    check('forged cookie is replaced with a new signed one', !!jar2.get('_did') && jar2.get('_did') !== tampered);
  }
}

async function testWeatherApi() {
  console.log('\n#26 Weather API for live widget refresh:');
  const jar = makeJar();
  const res = await request(jar, '/api/weather');
  check('endpoint responds 200', res.status === 200, `status: ${res.status}`);
  if (res.status !== 200) return;
  const { weather } = await res.json();
  check('payload has temp/description/fetchedAt', weather && 'temp' in weather && 'description' in weather && 'fetchedAt' in weather);
  check('payload has a stale flag', weather && typeof weather.stale === 'boolean');
}

async function testSessionRegeneration() {
  console.log('\n#34 Session ID regenerated on login:');
  const jar = makeJar();
  await request(jar, '/login'); // get an anonymous session cookie (if any)
  const before = jar.get('connect.sid');
  const res = await request(jar, '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: process.env.EDITOR_USER || 'editor1',
      password: process.env.EDITOR_PASS || 'editor123',
    }).toString(),
  });
  check('login succeeds (redirect)', res.status === 302, `status: ${res.status}`);
  const after = jar.get('connect.sid');
  check('session cookie set after login', !!after);
  if (before && after) check('session ID changed on login', before !== after);
  return jar; // logged-in editor jar
}

async function testAnalyticsRangeFilter(editorJar) {
  console.log('\n#28 Analytics API server-side range filter:');
  if (!editorJar || !editorJar.get('connect.sid')) {
    console.log('  (skipped — editor login unavailable)');
    return;
  }
  const articleId = await firstPublishedArticleId(editorJar);
  if (!articleId) { console.log('  (skipped — no published article)'); return; }
  const res = await request(editorJar, `/editor/api/analytics/${articleId}?hours=24`);
  check('endpoint responds 200', res.status === 200, `status: ${res.status}`);
  if (res.status !== 200) return;
  const { stats } = await res.json();
  const cutoff = Date.now() - 24 * 3600 * 1000 - 60 * 1000; // small tolerance
  check('all returned buckets are within the requested 24h range',
    stats.every(s => new Date(s.hour).getTime() >= cutoff));
  check('no bucket lies in the future (#25)',
    stats.every(s => new Date(s.hour).getTime() <= Date.now()));
}

async function testCrossOriginRejected() {
  console.log('\n#34 Cross-origin state-changing request rejected:');
  const jar = makeJar();
  const articleId = await firstPublishedArticleId(jar);
  if (!articleId) { console.log('  (skipped — no published article)'); return; }
  const res = await request(jar, `/article/${articleId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
    body: JSON.stringify({ author: 'CSRF Test', body: 'should be rejected' }),
  });
  check('request with foreign Origin is rejected (403)', res.status === 403, `status: ${res.status}`);
}

(async () => {
  console.log(`Running audit 19–38 checks against ${BASE_URL}`);
  try {
    await testCommentRateLimit();
    await testWeatherApi();
    await testCrossOriginRejected();
    const editorJar = await testSessionRegeneration();
    await testAnalyticsRangeFilter(editorJar);
  } catch (err) {
    console.error(`\nTest run aborted: ${err.message}`);
    console.error('Is the server running and the database seeded?');
    process.exit(1);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
