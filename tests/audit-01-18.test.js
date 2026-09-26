// Real HTTP + MongoDB regression tests. Each run owns a disposable database.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { spawn } = require("node:child_process");
const User = require("../models/User"),
  Article = require("../models/Article"),
  Comment = require("../models/Comment"),
  ViewStat = require("../models/ViewStat");
const uri = `mongodb://127.0.0.1:27017/audit_test_${process.pid}_${Date.now()}`;
const port = Number(process.env.TEST_PORT || 3198),
  base = `http://127.0.0.1:${port}`;
let child,
  editor,
  reporter,
  other,
  ec = "",
  rc = "";
const content = {
  title: "Title",
  summary: "Summary",
  content: "Body",
  image: "",
  category: "Technology",
};
async function req(path, method = "GET", body, cookie = "") {
  const res = await fetch(base + path, {
    method,
    redirect: "manual",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {}
  return { status: res.status, text, data, headers: res.headers };
}
async function article(extra = {}) {
  return Article.create({ ...content, author: reporter._id, ...extra });
}
before(async () => {
  await mongoose.connect(uri);
  const hash = await User.hashPassword("test-password");
  [editor, reporter, other] = await User.create([
    { username: "editor", name: "Editor", role: "editor", passwordHash: hash },
    {
      username: "reporter",
      name: "Reporter",
      role: "reporter",
      passwordHash: hash,
    },
    { username: "other", name: "Other", role: "reporter", passwordHash: hash },
  ]);
  child = spawn(process.execPath, ["app.js"], {
    cwd: require("node:path").join(__dirname, ".."),
    env: { ...process.env, PORT: String(port), MONGO_URI: uri },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      await req("/login");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  for (const [name, assign] of [
    ["editor", (x) => (ec = x)],
    ["reporter", (x) => (rc = x)],
  ]) {
    const r = await req("/login", "POST", {
      username: name,
      password: "test-password",
    });
    assert.equal(r.status, 302);
    assign(r.headers.get("set-cookie").split(";")[0]);
  }
});
after(async () => {
  if (child) {
    child.kill();
    await new Promise((r) => child.once("exit", r));
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
test("01 public content is inert text", async () => {
  const a = await article({
    status: "published",
    publishedAt: new Date(),
    content: "<script>window.auditXss=1</script>\ntext",
  });
  const r = await req("/article/" + a.id);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes("<script>window.auditXss"));
  assert.ok(r.text.includes("&lt;script&gt;"));
});
test("02 review content cannot terminate script context", async () => {
  const a = await article({
    status: "published",
    pendingUpdate: {
      ...content,
      status: "pending",
      content: "</script><script>window.auditXss=2</script>",
    },
  });
  const r = await req("/editor/articles/" + a.id, "GET", null, ec);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes("<script>window.auditXss=2"));
});
test("03 partial draft creation is allowed", async () => {
  const r = await req(
    "/reporter/articles",
    "POST",
    { title: "Started", category: "Technology" },
    rc,
  );
  assert.equal(r.status, 201);
  assert.ok(r.data.id);
});
test("05 manual save supersedes old autosave", async () => {
  const a = await article({
    autoSave: { title: "Old", content: "Old", summary: "Old" },
  });
  const r = await req(
    `/reporter/articles/${a.id}/save`,
    "PATCH",
    { ...content, title: "New" },
    rc,
  );
  assert.equal(r.status, 200);
  const page = await req(`/reporter/articles/${a.id}/edit`, "GET", null, rc);
  assert.ok(page.text.includes('value="New"'));
});
test("06 deliberately cleared image stays empty", async () => {
  const a = await article({
    image: "https://example.com/old.png",
    autoSave: { image: "", title: "Title" },
  });
  const r = await req(`/reporter/articles/${a.id}/edit`, "GET", null, rc);
  assert.ok(!r.text.includes('value="https://example.com/old.png"'));
});
test("08 editor edits pending version without changing live", async () => {
  const a = await article({
    status: "published",
    pendingUpdate: { ...content, status: "pending" },
  });
  const r = await req(
    `/editor/articles/${a.id}`,
    "PATCH",
    { ...content, title: "Edited update", target: "update" },
    ec,
  );
  assert.equal(r.status, 200);
  const saved = await Article.findById(a.id);
  assert.equal(saved.title, "Title");
  assert.equal(saved.pendingUpdate.title, "Edited update");
});
test("09 pending update cannot be overwritten by reporter", async () => {
  const a = await article({
    status: "published",
    pendingUpdate: { ...content, status: "pending" },
  });
  const r = await req(
    `/reporter/articles/${a.id}/submit-update`,
    "PATCH",
    content,
    rc,
  );
  assert.equal(r.status, 409);
});
test("09 pending main cannot be autosaved", async () => {
  const a = await article({ status: "pending" });
  assert.equal(
    (await req(`/reporter/articles/${a.id}/autosave`, "PATCH", content, rc))
      .status,
    409,
  );
});
test("10 return requires nonblank note", async () => {
  const a = await article({ status: "pending" });
  assert.equal(
    (
      await req(
        `/editor/articles/${a.id}/return`,
        "PATCH",
        { note: "  ", isUpdate: false },
        ec,
      )
    ).status,
    400,
  );
});
test("11 viewed filter is session specific", async () => {
  await article({ status: "published", publishedAt: new Date(), views: 100 });
  const r = await req("/api/articles?viewed=viewed");
  assert.equal(r.data.articles.length, 0);
});
test("12 equal-date pages are stable and disjoint", async () => {
  await Article.deleteMany({});
  await Article.insertMany(
    Array.from({ length: 45 }, (_, i) => ({
      ...content,
      title: "Tie " + i,
      author: reporter._id,
      status: "published",
      publishedAt: new Date("2025-01-01"),
    })),
  );
  const a = (await req("/api/articles?page=1")).data.articles,
    b = (await req("/api/articles?page=2")).data.articles;
  assert.equal(new Set([...a, ...b].map((x) => x._id)).size, 40);
  const ids = a.map((x) => x._id);
  assert.deepEqual(ids, [...ids].sort().reverse());
});
test("14 reporter dashboard includes update state", async () => {
  await article({
    status: "published",
    pendingUpdate: { ...content, status: "pending" },
  });
  const r = await req("/reporter", "GET", null, rc);
  assert.ok(r.text.includes("Update: Pending"));
});
test("15 editor pending filter includes published update", async () => {
  await article({
    title: "Awaiting unique update",
    status: "published",
    pendingUpdate: { ...content, status: "pending" },
  });
  const r = await req("/editor?status=pending", "GET", null, ec);
  assert.ok(r.text.includes("Awaiting unique update"));
});
test("16 blank update submission is rejected", async () => {
  const a = await article({ status: "published" });
  assert.equal(
    (await req(`/reporter/articles/${a.id}/submit-update`, "PATCH", {}, rc))
      .status,
    400,
  );
});
test("17 regex characters are literal search text", async () => {
  await article({
    title: "Literal [ token",
    status: "published",
    publishedAt: new Date(),
  });
  const r = await req("/api/articles?search=%5B");
  assert.equal(r.status, 200);
  assert.ok(
    r.data.articles.every(
      (a) => a.title.includes("[") || a.summary.includes("["),
    ),
  );
});
test("18 invalid page and ID return client errors", async () => {
  for (const p of ["0", "-1", "abc"])
    assert.equal((await req("/api/articles?page=" + p)).status, 400);
  assert.equal((await req("/article/not-an-id")).status, 400);
});
test("13 management CRUD is protected and does not expose hashes", async () => {
  assert.equal((await req("/editor/api/users")).status, 401);
  assert.equal((await req("/editor/api/users", "GET", null, rc)).status, 403);
  let r = await req(
    "/editor/api/users",
    "POST",
    {
      username: "managed",
      name: "Managed",
      role: "reporter",
      password: "password123",
    },
    ec,
  );
  assert.equal(r.status, 201);
  const id = r.data.item._id;
  assert.ok(!r.text.includes("passwordHash"));
  assert.equal(
    (await req("/editor/api/users/" + id, "PATCH", { name: "Changed" }, ec))
      .status,
    200,
  );
  r = await req("/editor/api/users?search=Changed", "GET", null, ec);
  assert.equal(r.data.items.length, 1);
  assert.equal(
    (await req("/editor/api/users/" + id, "GET", null, ec)).status,
    200,
  );
  assert.equal(
    (await req("/editor/api/users/" + id, "DELETE", null, ec)).status,
    200,
  );
  const a = await article({ status: "published" });
  for (const [resource, body, update] of [
    [
      "comments",
      { article: a.id, author: "Reader", body: "comment" },
      { body: "Changed" },
    ],
    [
      "viewstats",
      { article: a.id, hour: "2025-01-01T10:00:00Z", count: 2 },
      { count: 5 },
    ],
  ]) {
    r = await req("/editor/api/" + resource, "POST", body, ec);
    assert.equal(r.status, 201);
    const key = r.data.item._id;
    assert.equal(
      (await req(`/editor/api/${resource}/${key}`, "PATCH", update, ec)).status,
      200,
    );
    assert.equal(
      (await req(`/editor/api/${resource}?article=${a.id}`, "GET", null, ec))
        .data.items.length,
      1,
    );
    assert.equal(
      (await req(`/editor/api/${resource}/${key}`, "GET", null, ec)).status,
      200,
    );
    assert.equal(
      (await req(`/editor/api/${resource}/${key}`, "DELETE", null, ec)).status,
      200,
    );
  }
});
test("16 submission rejects whitespace, excessive length, wrong types and invalid category", async () => {
  for (const body of [
    { ...content, title: " " },
    { ...content, title: "x".repeat(201) },
    { ...content, content: {} },
    { ...content, category: "Unknown" },
  ])
    assert.equal(
      (await req("/reporter/articles", "POST", body, rc)).status,
      body.title === " " ? 201 : 400,
    );
  const a = await article();
  assert.equal(
    (
      await req(
        `/reporter/articles/${a.id}/submit`,
        "PATCH",
        { ...content, title: " " },
        rc,
      )
    ).status,
    400,
  );
});
test("09 ownership and stale revisions prevent overwrites", async () => {
  const foreign = await article({ author: other._id });
  assert.equal(
    (await req(`/reporter/articles/${foreign.id}/save`, "PATCH", content, rc))
      .status,
    404,
  );
  const a = await article();
  assert.equal(
    (
      await req(
        `/reporter/articles/${a.id}/autosave`,
        "PATCH",
        { ...content, revision: 0 },
        rc,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await req(
        `/reporter/articles/${a.id}/save`,
        "PATCH",
        { ...content, revision: 0 },
        rc,
      )
    ).status,
    409,
  );
});
test("03 duplicate create retry returns the same draft", async () => {
  const body = {
    title: "New",
    draftKey: "01234567-aaaa-bbbb-cccc-012345678901",
  };
  const a = await req("/reporter/articles", "POST", body, rc),
    b = await req("/reporter/articles", "POST", body, rc);
  assert.equal(a.status, 201);
  assert.equal(a.data.id, b.data.id);
});
test("18 malformed JSON, cookies and blank comments return 400", async () => {
  const a = await article({ status: "published" });
  assert.equal(
    (await req(`/article/${a.id}/comments`, "POST", { author: " ", body: " " }))
      .status,
    400,
  );
  let r = await fetch(base + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: "{invalid",
  });
  assert.equal(r.status, 400);
  assert.equal(
    (await req("/api/articles", "GET", null, "_did=%zz")).status,
    400,
  );
});
test("08 approval publishes only the edited pending content", async () => {
  const a = await article({
    status: "published",
    pendingUpdate: { ...content, title: "Before edit", status: "pending" },
  });
  assert.equal(
    (
      await req(
        `/editor/articles/${a.id}`,
        "PATCH",
        { ...content, title: "Approved edit", target: "update" },
        ec,
      )
    ).status,
    200,
  );
  assert.equal(
    (await req(`/editor/articles/${a.id}/approve-update`, "PATCH", {}, ec))
      .status,
    200,
  );
  assert.equal((await Article.findById(a.id)).title, "Approved edit");
});
test("13 deleting user with articles or current editor is rejected", async () => {
  assert.equal(
    (await req("/editor/api/users/" + reporter.id, "DELETE", null, ec)).status,
    409,
  );
  assert.equal(
    (await req("/editor/api/users/" + editor.id, "DELETE", null, ec)).status,
    409,
  );
});
test('11 viewed and unviewed partition the same session history',async()=>{
 const a=await article({status:'published',publishedAt:new Date()});const visit=await req('/article/'+a.id);const cookie=visit.headers.get('set-cookie').split(';')[0];
 const seen=await req('/api/articles?viewed=viewed','GET',null,cookie),unseen=await req('/api/articles?viewed=unviewed','GET',null,cookie);
 assert.deepEqual(seen.data.articles.map(a=>a._id),[a.id]);assert.ok(unseen.data.articles.every(x=>x._id!==a.id));
});
test('13 view record CRUD keeps article total aligned',async()=>{
 const a=await article({status:'published'});let r=await req('/editor/api/viewstats','POST',{article:a.id,hour:'2025-02-01T10:00:00Z',count:4},ec);const id=r.data.item._id;assert.equal((await Article.findById(a.id)).views,4);
 await req('/editor/api/viewstats/'+id,'PATCH',{count:9},ec);assert.equal((await Article.findById(a.id)).views,9);
 await req('/editor/api/viewstats/'+id,'DELETE',null,ec);assert.equal((await Article.findById(a.id)).views,0);
});
test('09 returning nonexistent update and autosaving pending update are rejected',async()=>{
 const a=await article();assert.equal((await req(`/editor/articles/${a.id}/return`,'PATCH',{note:'fix',isUpdate:true},ec)).status,409);
 const b=await article({status:'published',pendingUpdate:{...content,status:'pending'}});assert.equal((await req(`/reporter/articles/${b.id}/autosave`,'PATCH',{...content,isUpdate:true},rc)).status,409);
});
