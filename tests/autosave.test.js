const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
function editor({
  id = null,
  fail = false,
  storage = new Map(),
  revision = 0,
  gate = null,
} = {}) {
  const nodes = {},
    listeners = {},
    timers = new Map(),
    requests = [];
  let seq = 0;
  for (const key of [
    "article-form",
    "autosave-status",
    "form-error",
    "title",
    "summary",
    "content",
    "image",
    "category",
    "save-draft-btn",
    "submit-btn",
  ])
    nodes[key] = {
      value: key === "category" ? "Technology" : "",
      textContent: "",
      disabled: false,
      classList: { add() {}, remove() {} },
      addEventListener(e, fn) {
        (this.events ??= {})[e] = fn;
      },
      scrollIntoView() {},
      focus() {},
    };
  const window = {
    ARTICLE_ID: id,
    ARTICLE_REVISION: revision,
    ARTICLE_USER: "reporter",
    ARTICLE_EDITABLE: true,
    IS_PUBLISHED: false,
    HAS_PENDING_UPDATE: false,
    location: { href: "", origin: "http://localhost" },
    history: { replaceState() {} },
    addEventListener(e, fn) {
      listeners[e] = fn;
    },
  };
  const ctx = {
    window,
    document: {
      getElementById: (x) => nodes[x],
      querySelectorAll: (q) =>
        q === "a[href]" ? [] : q === ".btn" ? [nodes["save-draft-btn"]] : [],
      addEventListener(e, fn) {
        listeners[e] = fn;
      },
    },
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k),
    },
    crypto: { randomUUID: () => "01234567-1234-1234-1234-012345678901" },
    URL,
    Date,
    JSON,
    console,
    confirm: () => true,
    setTimeout: (fn, ms) => {
      timers.set(++seq, { fn, ms });
      return seq;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (gate) await gate(requests.length);
      return {
        ok: !fail,
        status: fail ? 500 : 200,
        json: async () =>
          fail
            ? { error: "Save failed" }
            : {
                id: "aaaaaaaaaaaaaaaaaaaaaaaa",
                savedAt: new Date().toISOString(),
                revision: ++revision,
              },
      };
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve("../public/js/article-editor.js"), "utf8"),
    ctx,
  );
  return {
    nodes,
    requests,
    listeners,
    storage,
    async type(text) {
      nodes.title.value = text;
      nodes.title.events.input();
    },
    async tick() {
      for (const [id, t] of [...timers]) {
        timers.delete(id);
        t.fn();
      }
      for (let i = 0; i < 8; i++) await new Promise(setImmediate);
    },
  };
}
test("03 new article typing creates a server draft without Save click", async () => {
  const e = editor();
  await e.type("Started");
  await e.tick();
  assert.ok(e.requests.some((r) => r.url === "/reporter/articles"));
});
test("04 last keystroke is locally recoverable before debounce and guards exit", async () => {
  const storage = new Map(),
    e = editor({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", storage });
  await e.type("Not yet sent");
  assert.ok([...storage.values()].some((v) => v.includes("Not yet sent")));
  let warned = false;
  e.listeners.beforeunload({
    preventDefault() {
      warned = true;
    },
  });
  assert.ok(warned);
  const reopened = editor({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", storage });
  assert.equal(reopened.nodes.title.value, "Not yet sent");
});
test("07 non-OK save shows failure and remains dirty", async () => {
  const e = editor({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", fail: true });
  await e.type("New");
  await e.tick();
  assert.match(e.nodes["autosave-status"].textContent, /fail|not saved/i);
  let warned = false;
  e.listeners.beforeunload({
    preventDefault() {
      warned = true;
    },
  });
  assert.ok(warned);
});
test('04 acknowledged save clears exit warning and recovery copy',async()=>{const e=editor({id:'aaaaaaaaaaaaaaaaaaaaaaaa'});await e.type('Saved');await e.tick();let warned=false;e.listeners.beforeunload({preventDefault(){warned=true;}});assert.equal(warned,false);assert.equal(e.storage.size,0);});
test('05 manual save waits for older autosave and sends latest content',async()=>{
 let release;const barrier=new Promise(r=>release=r);const e=editor({id:'aaaaaaaaaaaaaaaaaaaaaaaa',gate:n=>n===1?barrier:Promise.resolve()});
 await e.type('Old');await e.tick();await e.type('Latest');const saving=e.nodes['save-draft-btn'].events.click();await e.tick();assert.equal(e.requests.length,1);
 release();await saving;assert.equal(e.requests.length,2);assert.ok(e.requests[1].url.endsWith('/save'));assert.equal(e.requests[1].body.title,'Latest');assert.equal(e.requests[1].body.revision,1);
});
