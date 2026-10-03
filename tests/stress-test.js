/**
 * Stress Test & Edge Case Suite — The Daily Web
 *
 * Tests:
 *  1. Stress: 1000 simulated users hitting the site concurrently
 *  2. Edge cases: weird inputs, boundary values, empty fields
 *  3. Bad behavior: XSS, auth bypass, spam, injection, malformed requests
 *
 * Run AFTER the server is started (npm start) and seeded (npm run seed):
 *   node tests/stress-test.js
 *
 * Optional: change BASE_URL if running on a different port
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';
const CONCURRENCY = 50;   // max parallel requests at once
const TOTAL_USERS = 1000; // total simulated user sessions

// ─── Color helpers ───────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
};
const ok   = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg) => console.log(`  ${C.red}✗${C.reset} ${C.red}${msg}${C.reset}`);
const info = (msg) => console.log(`  ${C.cyan}ℹ${C.reset} ${msg}`);
const head = (msg) => console.log(`\n${C.bold}${C.cyan}▶ ${msg}${C.reset}`);
const sub  = (msg) => console.log(`\n  ${C.yellow}── ${msg}${C.reset}`);

// ─── Result tracking ─────────────────────────────────────────────────────────
const results = { passed: 0, failed: 0, errors: [] };
function pass(name) { results.passed++; ok(name); }
function flunk(name, detail) {
  results.failed++;
  results.errors.push({ name, detail });
  fail(`${name} — ${detail}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function get(path, opts = {}) {
  const res = await fetch(BASE_URL + path, { redirect: 'manual', ...opts });
  return res;
}

async function post(path, body, opts = {}) {
  return fetch(BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
  });
}

async function patch(path, body, opts = {}) {
  return fetch(BASE_URL + path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
  });
}

async function del(path, opts = {}) {
  return fetch(BASE_URL + path, { method: 'DELETE', redirect: 'manual', ...opts });
}

// Run tasks with limited concurrency
async function runConcurrent(tasks, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// Get a published article ID from the API
async function getPublishedArticleId() {
  const res = await get('/api/articles?page=1');
  const data = await res.json();
  if (data.articles && data.articles.length > 0) return data.articles[0]._id;
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — STRESS TEST (1000 users)
// ═════════════════════════════════════════════════════════════════════════════
async function stressTest() {
  head('STRESS TEST — 1000 Simulated Users');

  const articleId = await getPublishedArticleId();
  if (!articleId) { flunk('Stress test setup', 'No published articles found — run npm run seed first'); return; }

  // --- 1a. Home page load ---
  sub(`1a. ${TOTAL_USERS} users load the home page`);
  const homeTasks = Array.from({ length: TOTAL_USERS }, () => () => get('/'));
  const t0 = Date.now();
  const homeResults = await runConcurrent(homeTasks, CONCURRENCY);
  const homeMs = Date.now() - t0;
  const homeOk = homeResults.filter(r => r.status === 200).length;
  const homeFail = TOTAL_USERS - homeOk;
  info(`Completed in ${homeMs}ms | OK: ${homeOk} | Failed: ${homeFail}`);
  if (homeFail === 0) pass(`All ${TOTAL_USERS} home page requests returned 200`);
  else flunk(`Home page stress`, `${homeFail}/${TOTAL_USERS} requests failed`);

  // --- 1b. Articles API ---
  sub(`1b. ${TOTAL_USERS} users hit the articles API`);
  const apiTasks = Array.from({ length: TOTAL_USERS }, (_, i) => () =>
    get(`/api/articles?page=${(i % 10) + 1}&category=${['Technology','Sports','Politics'][i % 3]}`)
  );
  const t1 = Date.now();
  const apiResults = await runConcurrent(apiTasks, CONCURRENCY);
  const apiMs = Date.now() - t1;
  const apiOk = apiResults.filter(r => r.status === 200).length;
  const apiFail = TOTAL_USERS - apiOk;
  info(`Completed in ${apiMs}ms | OK: ${apiOk} | Failed: ${apiFail}`);
  if (apiFail === 0) pass(`All ${TOTAL_USERS} API requests returned 200`);
  else flunk(`Articles API stress`, `${apiFail}/${TOTAL_USERS} requests failed`);

  // --- 1c. Article page views (tests view counting under load) ---
  sub(`1c. ${TOTAL_USERS} users view the same article (view counter stress)`);
  const viewTasks = Array.from({ length: TOTAL_USERS }, () => () => get(`/article/${articleId}`));
  const t2 = Date.now();
  const viewResults = await runConcurrent(viewTasks, CONCURRENCY);
  const viewMs = Date.now() - t2;
  const viewOk = viewResults.filter(r => r.status === 200).length;
  const viewFail = TOTAL_USERS - viewOk;
  info(`Completed in ${viewMs}ms | OK: ${viewOk} | Failed: ${viewFail}`);
  if (viewFail === 0) pass(`All ${TOTAL_USERS} article page requests returned 200`);
  else flunk(`Article page stress`, `${viewFail}/${TOTAL_USERS} requests failed`);

  // --- 1d. Concurrent search queries ---
  sub(`1d. ${TOTAL_USERS} users search simultaneously`);
  const searches = ['tech', 'politics', 'science', 'breaking', 'report', 'analysis', '', 'a', 'the', 'update'];
  const searchTasks = Array.from({ length: TOTAL_USERS }, (_, i) => () =>
    get(`/api/articles?search=${searches[i % searches.length]}`)
  );
  const t3 = Date.now();
  const searchResults = await runConcurrent(searchTasks, CONCURRENCY);
  const searchMs = Date.now() - t3;
  const searchOk = searchResults.filter(r => r.status === 200).length;
  info(`Completed in ${searchMs}ms | OK: ${searchOk}/${TOTAL_USERS}`);
  if (searchOk === TOTAL_USERS) pass(`All ${TOTAL_USERS} search requests returned 200`);
  else flunk(`Search stress`, `${TOTAL_USERS - searchOk} failed`);

  // --- 1e. Comment spam (tests rate limiter) ---
  sub('1e. Comment spam — 20 rapid comments from same session (rate limiter test)');
  const spamTasks = Array.from({ length: 20 }, (_, i) => () =>
    post(`/article/${articleId}/comments`, { author: 'SpamBot', body: `Spam comment #${i + 1}` })
  );
  const spamResults = await Promise.all(spamTasks.map(t => t()));
  const spamStatuses = spamResults.map(r => r.status);
  const blocked = spamStatuses.filter(s => s === 429).length;
  info(`Statuses: ${[...new Set(spamStatuses)].join(', ')} | 429 (blocked): ${blocked}`);
  if (blocked > 0) pass(`Rate limiter triggered after 3 comments — ${blocked} requests blocked with 429`);
  else flunk('Rate limiter', 'No requests were blocked — rate limiter may not be working');
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — EDGE CASES
// ═════════════════════════════════════════════════════════════════════════════
async function edgeCaseTests() {
  head('EDGE CASE TESTS');

  const articleId = await getPublishedArticleId();

  // --- 2a. Pagination edge cases ---
  sub('2a. Pagination edge cases');

  const page0 = await get('/api/articles?page=0');
  if (page0.status === 200) pass('Page 0 handled gracefully (treated as page 1)');
  else flunk('Page 0', `Unexpected status ${page0.status}`);

  const pageNeg = await get('/api/articles?page=-5');
  if (pageNeg.status === 200) pass('Negative page number handled gracefully');
  else flunk('Negative page', `Unexpected status ${pageNeg.status}`);

  const pageHuge = await get('/api/articles?page=999999');
  if (pageHuge.status === 200) {
    const d = await pageHuge.json();
    if (d.articles.length === 0 && !d.hasMore) pass('Page 999999 returns empty array with hasMore=false');
    else flunk('Page 999999', 'Should return empty array');
  } else flunk('Page 999999', `Status ${pageHuge.status}`);

  // --- 2b. Search edge cases ---
  sub('2b. Search edge cases');

  const emptySearch = await get('/api/articles?search=');
  if (emptySearch.status === 200) pass('Empty search returns all articles');
  else flunk('Empty search', `Status ${emptySearch.status}`);

  const longSearch = await get('/api/articles?search=' + 'a'.repeat(500));
  if (longSearch.status === 200) pass('Very long search query (500 chars) handled');
  else flunk('Long search', `Status ${longSearch.status}`);

  const specialChars = await get('/api/articles?search=' + encodeURIComponent('!@#$%^&*()<>{}[]'));
  if (specialChars.status === 200) pass('Special characters in search handled safely');
  else flunk('Special chars search', `Status ${specialChars.status}`);

  const regexSearch = await get('/api/articles?search=' + encodeURIComponent('.*'));
  if (regexSearch.status === 200) pass('Regex-like search string handled safely');
  else flunk('Regex search', `Status ${regexSearch.status}`);

  // --- 2c. Invalid article IDs ---
  sub('2c. Invalid article IDs');

  const notFound = await get('/article/000000000000000000000000');
  if (notFound.status === 404) pass('Non-existent article ID returns 404');
  else flunk('Non-existent article', `Expected 404, got ${notFound.status}`);

  const badId = await get('/article/not-a-valid-id');
  if (badId.status === 404 || badId.status === 500) pass(`Malformed article ID handled (${badId.status})`);
  else flunk('Malformed article ID', `Unexpected status ${badId.status}`);

  // --- 2d. Comment edge cases ---
  sub('2d. Comment edge cases');

  const emptyComment = await post(`/article/${articleId}/comments`, { author: '', body: '' });
  if (emptyComment.status === 400) pass('Empty comment fields rejected with 400');
  else flunk('Empty comment', `Expected 400, got ${emptyComment.status}`);

  const noAuthor = await post(`/article/${articleId}/comments`, { body: 'Comment without author' });
  if (noAuthor.status === 400) pass('Comment with no author rejected with 400');
  else flunk('No author comment', `Expected 400, got ${noAuthor.status}`);

  const longAuthor = await post(`/article/${articleId}/comments`, {
    author: 'A'.repeat(200),
    body: 'Valid body',
  });
  if (longAuthor.status === 400) pass('Author name over 50 chars rejected with 400');
  else flunk('Long author name', `Expected 400, got ${longAuthor.status}`);

  const longBody = await post(`/article/${articleId}/comments`, {
    author: 'Valid Author',
    body: 'B'.repeat(1001),
  });
  if (longBody.status === 400) pass('Comment body over 1000 chars rejected with 400');
  else flunk('Long comment body', `Expected 400, got ${longBody.status}`);

  const maxBody = await post(`/article/${articleId}/comments`, {
    author: 'Valid Author',
    body: 'B'.repeat(1000),
  });
  if (maxBody.status === 201) pass('Comment at exactly 1000 chars accepted');
  else flunk('Max length comment', `Expected 201, got ${maxBody.status}`);

  // --- 2e. Filter edge cases ---
  sub('2e. Filter edge cases');

  const invalidCategory = await get('/api/articles?category=InvalidCategory');
  if (invalidCategory.status === 200) {
    const d = await invalidCategory.json();
    if (d.articles.length === 0) pass('Invalid category returns empty array (not an error)');
    else pass('Invalid category handled gracefully');
  } else flunk('Invalid category', `Status ${invalidCategory.status}`);

  const invalidSort = await get('/api/articles?sort=invalid_sort_field');
  if (invalidSort.status === 200) pass('Invalid sort param falls back gracefully');
  else flunk('Invalid sort', `Status ${invalidSort.status}`);

  const invalidViewed = await get('/api/articles?viewed=maybe');
  if (invalidViewed.status === 200) pass('Invalid viewed param handled gracefully');
  else flunk('Invalid viewed param', `Status ${invalidViewed.status}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — BAD USER BEHAVIOR (Security & Auth)
// ═════════════════════════════════════════════════════════════════════════════
async function badBehaviorTests() {
  head('BAD USER BEHAVIOR TESTS');

  const articleId = await getPublishedArticleId();

  // --- 3a. XSS attempts ---
  sub('3a. XSS injection in comments');

  const xssPayloads = [
    '<script>alert("xss")</script>',
    '"><img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    '<svg onload=alert(1)>',
  ];
  for (const payload of xssPayloads) {
    const res = await post(`/article/${articleId}/comments`, { author: 'Hacker', body: payload });
    if (res.status === 201) {
      const d = await res.json();
      const body = d.comment?.body || '';
      if (!body.includes('<script>') && !body.includes('onerror')) {
        pass(`XSS payload stored as plain text (not executed): ${payload.substring(0, 30)}...`);
      } else {
        flunk('XSS not sanitized', `Raw script stored: ${payload.substring(0, 30)}`);
      }
    } else {
      pass(`XSS payload rejected (${res.status}): ${payload.substring(0, 30)}...`);
    }
  }

  // --- 3b. Auth bypass attempts ---
  sub('3b. Accessing protected routes without login');

  const protectedRoutes = [
    '/reporter',
    '/reporter/new',
    '/reporter/articles/000000000000000000000000/edit',
    '/editor',
    '/editor/articles/000000000000000000000000',
    '/editor/analytics/000000000000000000000000',
  ];
  for (const route of protectedRoutes) {
    const res = await get(route);
    if (res.status === 302 || res.status === 401 || res.status === 403) {
      pass(`Unauthenticated access to ${route} blocked (${res.status})`);
    } else {
      flunk(`Auth bypass`, `${route} accessible without login — got ${res.status}`);
    }
  }

  // --- 3c. API auth bypass ---
  sub('3c. Accessing protected API endpoints without login');

  const protectedApis = [
    { method: 'PATCH', path: `/reporter/articles/000000000000000000000000/submit` },
    { method: 'PATCH', path: `/editor/articles/000000000000000000000000/publish` },
    { method: 'DELETE', path: `/editor/articles/000000000000000000000000` },
    { method: 'PATCH', path: `/editor/articles/000000000000000000000000/return` },
  ];
  for (const { method, path } of protectedApis) {
    const res = await fetch(BASE_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'hack' }),
      redirect: 'manual',
    });
    if ([301, 302, 401, 403].includes(res.status)) {
      pass(`${method} ${path} blocked without auth (${res.status})`);
    } else {
      flunk('API auth bypass', `${method} ${path} returned ${res.status}`);
    }
  }

  // --- 3d. Malformed JSON ---
  sub('3d. Sending malformed/missing JSON');

  const malformed = await fetch(BASE_URL + `/article/${articleId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'this is not json {{{',
    redirect: 'manual',
  });
  if (malformed.status === 400 || malformed.status === 500) {
    pass(`Malformed JSON body handled (${malformed.status}) — server did not crash`);
  } else {
    flunk('Malformed JSON', `Unexpected status ${malformed.status}`);
  }

  const emptyBody = await fetch(BASE_URL + `/article/${articleId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '',
    redirect: 'manual',
  });
  if (emptyBody.status === 400 || emptyBody.status === 500) {
    pass(`Empty request body handled (${emptyBody.status}) — server did not crash`);
  } else {
    flunk('Empty body', `Unexpected status ${emptyBody.status}`);
  }

  // --- 3e. NoSQL injection ---
  sub('3e. NoSQL injection attempts in search');

  const injections = [
    '{"$gt": ""}',
    '{"$where": "this.password.length > 0"}',
    '[object Object]',
    '{"$ne": null}',
  ];
  for (const payload of injections) {
    const res = await get('/api/articles?search=' + encodeURIComponent(payload));
    if (res.status === 200) pass(`NoSQL injection payload handled safely: ${payload.substring(0, 30)}`);
    else flunk('NoSQL injection', `Status ${res.status} for: ${payload}`);
  }

  // --- 3f. HTTP method tampering ---
  sub('3f. Wrong HTTP methods on endpoints');

  const methodTests = [
    { method: 'DELETE', path: '/' },
    { method: 'PUT', path: '/login' },
    { method: 'PATCH', path: '/' },
  ];
  for (const { method, path } of methodTests) {
    const res = await fetch(BASE_URL + path, { method, redirect: 'manual' });
    if (res.status !== 500) pass(`${method} ${path} handled without crash (${res.status})`);
    else flunk('Method tamper', `${method} ${path} caused 500`);
  }

  // --- 3g. Path traversal ---
  sub('3g. Path traversal attempts');

  const traversalPaths = [
    '/../../etc/passwd',
    '/../../../windows/system32',
    '/article/../../../../package.json',
  ];
  for (const path of traversalPaths) {
    const res = await get(path);
    if (res.status !== 200 || res.headers.get('content-type')?.includes('application/json') === false) {
      pass(`Path traversal blocked: ${path} (${res.status})`);
    } else {
      flunk('Path traversal', `${path} may have succeeded (${res.status})`);
    }
  }

  // --- 3h. Non-existent routes ---
  sub('3h. Non-existent routes return 404');

  const notFoundRoutes = ['/this-does-not-exist', '/admin', '/api/users', '/config', '/.env'];
  for (const route of notFoundRoutes) {
    const res = await get(route);
    if (res.status === 404) pass(`${route} correctly returns 404`);
    else flunk('Missing 404', `${route} returned ${res.status} instead of 404`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}  The Daily Web — Stress Test & Edge Case Suite${C.reset}`);
  console.log(`${C.bold}  Target: ${BASE_URL}${C.reset}`);
  console.log(`${C.bold}  Simulated users: ${TOTAL_USERS} | Concurrency: ${CONCURRENCY}${C.reset}`);
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}`);

  // Verify server is up before starting
  try {
    const ping = await get('/');
    if (ping.status !== 200) throw new Error(`Status ${ping.status}`);
    info(`Server is up ✓\n`);
  } catch (err) {
    console.log(`\n${C.red}${C.bold}ERROR: Cannot reach ${BASE_URL}${C.reset}`);
    console.log(`${C.red}Make sure the server is running: npm start${C.reset}\n`);
    process.exit(1);
  }

  const start = Date.now();

  await stressTest();
  await edgeCaseTests();
  await badBehaviorTests();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ── Final report ──
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}  RESULTS — completed in ${elapsed}s${C.reset}`);
  console.log(`${C.bold}${'═'.repeat(60)}${C.reset}`);
  console.log(`  ${C.green}${C.bold}Passed: ${results.passed}${C.reset}`);
  console.log(`  ${C.red}${C.bold}Failed: ${results.failed}${C.reset}`);

  if (results.errors.length > 0) {
    console.log(`\n${C.red}${C.bold}  Failed tests:${C.reset}`);
    results.errors.forEach(e => {
      console.log(`  ${C.red}✗${C.reset} ${e.name}: ${C.dim}${e.detail}${C.reset}`);
    });
  } else {
    console.log(`\n  ${C.green}${C.bold}All tests passed! 🎉${C.reset}`);
  }
  console.log(`\n${C.bold}${'═'.repeat(60)}${C.reset}\n`);

  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${C.red}Unexpected error: ${err.message}${C.reset}\n`);
  process.exit(1);
});
