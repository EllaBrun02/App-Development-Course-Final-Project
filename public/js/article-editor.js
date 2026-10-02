(function () {
  "use strict";
  const form = document.getElementById("article-form");
  if (!form) return;
  let id = window.ARTICLE_ID,
    revision = window.ARTICLE_REVISION || 0;
  const editable = window.ARTICLE_EDITABLE !== false;
  const status = document.getElementById("autosave-status"),
    error = document.getElementById("form-error");
  const fields = ["title", "summary", "content", "image", "category"];
  let timer = null,
    dirty = false,
    busy = false,
    queue = Promise.resolve();
  let key = `dailyweb:draft:${window.ARTICLE_USER}:${id || "new"}`;
  let draftKey = crypto.randomUUID(),
    saved = "";
  function data() {
    return Object.fromEntries(
      fields.map((k) => [k, document.getElementById(k)?.value || ""]),
    );
  }
  function message(text) {
    status.textContent = text;
  }
  function showError(e) {
    error.textContent = e.message || String(e);
    error.classList.remove("hidden");
  }
  function backup() {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ data: data(), revision, draftKey }),
      );
    } catch (e) {
      message(
        "Not saved locally. Keep this page open until the server confirms saving.",
      );
    }
  }
  function acknowledge(snapshot) {
    saved = JSON.stringify(snapshot);
    dirty = JSON.stringify(data()) !== saved;
    if (dirty) backup();
    else {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
    message(dirty ? "Changes not saved yet" : "Saved to server");
    error.classList.add("hidden");
  }
  // A local recovery copy protects the last keystrokes; acknowledged work lives on the server.
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached && editable) {
      if (cached.revision === revision) {
        for (const k of fields)
          if (typeof cached.data[k] === "string")
            document.getElementById(k).value = cached.data[k];
        draftKey = cached.draftKey;
        dirty = true;
        message("Recovered unsaved work; saving to server…");
      } else {
        showError(
          new Error(
            "The server changed since this local draft was saved. Review the server version before restoring your local work.",
          ),
        );
        const restore = document.createElement("button");
        restore.type = "button";
        restore.textContent = "Restore local draft";
        restore.addEventListener("click", () => {
          if (
            !confirm(
              "Replace the displayed fields with the local recovery copy?",
            )
          )
            return;
          for (const k of fields)
            if (typeof cached.data[k] === "string")
              document.getElementById(k).value = cached.data[k];
          dirty = true;
          backup();
          message("Local work restored; saving…");
          restore.remove();
          flush().catch(failed);
        });
        error.after(restore);
      }
    }
  } catch (e) {
    showError(
      new Error(
        "Local recovery is unavailable. Keep the page open until saving completes.",
      ),
    );
  }
  async function api(url, body, method = "PATCH", keepalive = false) {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      keepalive,
    });
    let result;
    try {
      result = await res.json();
    } catch {
      throw new Error("Save failed. Please sign in again or retry.");
    }
    if (!res.ok) throw new Error(result.error || "Save failed");
    if (result.revision !== undefined) revision = result.revision;
    return result;
  }
  async function ensureId(snapshot) {
    if (id) return;
    const category = document.getElementById("category");
    category.disabled = true;
    let result;
    try {
      result = await api(
        "/reporter/articles",
        { ...snapshot, draftKey },
        "POST",
      );
    } catch (err) {
      category.disabled = busy || !editable;
      throw err;
    }
    id = result.id;
    // Move recovery before removing its old key; retain it if navigation interrupts.
    const old = key;
    key = `dailyweb:draft:${window.ARTICLE_USER}:${id}`;
    backup();
    try {
      localStorage.removeItem(old);
    } catch {}
    window.history.replaceState(null, "", `/reporter/articles/${id}/edit`);
    document.getElementById("category").disabled = true;
  }
  function enqueue(task) {
    const next = queue.catch(() => {}).then(task);
    queue = next;
    return next;
  }
  function failed(e) {
    dirty = true;
    backup();
    message(
      "Auto-save failed — changes not saved to server. Retry by editing or pressing Save Draft.",
    );
    showError(e);
  }
  function flush(keepalive = false) {
    clearTimeout(timer);
    return enqueue(async () => {
      if (!editable || !dirty) return;
      const snapshot = data();
      message("Saving…");
      await ensureId(snapshot);
      await api(
        `/reporter/articles/${id}/autosave`,
        { ...snapshot, isUpdate: !!window.IS_PUBLISHED, revision },
        "PATCH",
        keepalive,
      );
      acknowledge(snapshot);
    });
  }
  for (const k of fields) {
    const input = document.getElementById(k);
    if (!editable) {
      input.disabled = true;
      continue;
    }
    input.addEventListener("input", () => {
      dirty = true;
      backup();
      message("Changes not saved yet");
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(failed), id ? 1000 : 350);
    });
  }
  function lock(value) {
    busy = value;
    for (const k of fields) {
      document.getElementById(k).disabled =
        value || !editable || (k === "category" && !!id);
    }
    for (const key of ["save-draft-btn", "submit-btn", "submit-update-btn"]) {
      const b = document.getElementById(key);
      if (b) b.disabled = value;
    }
  }
  async function act(kind) {
    if (busy || !editable) return;
    const snapshot = data();
    if (
      kind !== "save" &&
      ["title", "summary", "content"].some((k) => !snapshot[k].trim())
    ) {
      showError(new Error("Title, summary and content are required."));
      return;
    }
    if (kind !== "save" && !confirm("Submit this content for editor review?"))
      return;
    clearTimeout(timer);
    lock(true);
    try {
      await enqueue(async () => {
        await ensureId(snapshot);
        await api(`/reporter/articles/${id}/${kind}`, {
          ...snapshot,
          revision,
        });
        acknowledge(snapshot);
      });
      error.classList.add("hidden");
      if (kind !== "save") window.location.href = "/reporter";
    } catch (e) {
      failed(e);
    } finally {
      lock(false);
    }
  }
  for (const [button, kind] of [
    ["save-draft-btn", "save"],
    ["submit-btn", "submit"],
    ["submit-update-btn", "submit-update"],
  ]) {
    const el = document.getElementById(button);
    if (el) el.addEventListener("click", () => act(kind));
  }
  document.querySelectorAll("a[href]").forEach((link) =>
    link.addEventListener("click", async (e) => {
      if (
        !dirty ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        link.target === "_blank"
      )
        return;
      e.preventDefault();
      if (busy) return;
      lock(true);
      try {
        await flush();
        window.location.href = link.href;
      } catch (err) {
        failed(err);
      } finally {
        lock(false);
      }
    }),
  );
  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      backup();
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("pagehide", () => {
    if (dirty) {
      backup();
      flush(true).catch(failed);
    }
  });
  if (dirty) timer = setTimeout(() => flush().catch(failed), 350);
})();
