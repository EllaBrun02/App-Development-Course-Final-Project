// Reporter article editor: auto-saves to the server, keeps a localStorage recovery copy, and runs the
// Save Draft / Submit for Review / Submit Update buttons.
(function () {
  'use strict';
  const form = document.getElementById('article-form');
  if (!form) return;
  let id = window.ARTICLE_ID,
    revision = window.ARTICLE_REVISION || 0;
  const editable = window.ARTICLE_EDITABLE !== false;
  const status = document.getElementById('autosave-status'),
    error = document.getElementById('form-error');
  const fields = ['title', 'summary', 'content', 'image', 'category'];
  let timer = null,
    dirty = false,
    busy = false,
    queue = Promise.resolve();
  let key = `dailyweb:draft:${window.ARTICLE_USER}:${id || 'new'}`;
  let draftKey = crypto.randomUUID(),
    saved = '';
  // Reads the current form values into a plain object.
  function data() {
    return Object.fromEntries(fields.map((k) => [k, document.getElementById(k)?.value || '']));
  }
  // Shows text in the auto-save status line.
  function message(text) {
    status.textContent = text;
  }
  // Shows an error above the form.
  function showError(e) {
    error.textContent = e.message || String(e);
    error.classList.remove('hidden');
    // Move focus so screen readers announce the error
    if (typeof error.focus === 'function') error.focus();
  }
  // Writes the fields to localStorage as a recovery copy, tagged with the server revision it was based on.
  function backup() {
    try {
      localStorage.setItem(key, JSON.stringify({ data: data(), revision, draftKey }));
    } catch (e) {
      message('Not saved locally. Keep this page open until the server confirms saving.');
    }
  }
  // Called after the server saved a snapshot: drops the local copy unless the user kept typing meanwhile.
  function acknowledge(snapshot) {
    saved = JSON.stringify(snapshot);
    dirty = JSON.stringify(data()) !== saved;
    if (dirty) backup();
    else {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
    message(dirty ? 'Changes not saved yet' : 'Saved to server');
    error.classList.add('hidden');
  }
  // A local recovery copy protects the last keystrokes; acknowledged work lives on the server.
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached && editable) {
      if (cached.revision === revision) {
        for (const k of fields)
          if (typeof cached.data[k] === 'string') document.getElementById(k).value = cached.data[k];
        draftKey = cached.draftKey;
        dirty = true;
        message(window.IS_PUBLISHED ? 'Recovered your unsubmitted changes' : 'Recovered unsaved work; saving to server…');
      } else {
        showError(
          new Error(
            'The server changed since this local draft was saved. Review the server version before restoring your local work.',
          ),
        );
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = 'Restore local draft';
        // Lets the user replace the fields with the local copy, then saves it to the server.
        restore.addEventListener('click', () => {
          if (!confirm('Replace the displayed fields with the local recovery copy?')) return;
          for (const k of fields)
            if (typeof cached.data[k] === 'string')
              document.getElementById(k).value = cached.data[k];
          dirty = true;
          backup();
          message('Local work restored; saving…');
          restore.remove();
          flush().catch(failed);
        });
        error.after(restore);
      }
    }
  } catch (e) {
    showError(
      new Error('Local recovery is unavailable. Keep the page open until saving completes.'),
    );
  }
  // Sends JSON to the server and keeps the new revision it returns; throws with the server's error message.
  async function api(url, body, method = 'PATCH', keepalive = false) {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      keepalive,
    });
    let result;
    try {
      result = await res.json();
    } catch {
      throw new Error('Save failed. Please sign in again or retry.');
    }
    if (!res.ok) throw new Error(result.error || 'Save failed');
    if (result.revision !== undefined) revision = result.revision;
    return result;
  }
  // A new article has no id yet, so create it first (draftKey stops a retry from creating a duplicate),
  // then move the local copy to the new id's key and switch the URL to the edit page.
  async function ensureId(snapshot) {
    if (id) return;
    const category = document.getElementById('category');
    category.disabled = true;
    let result;
    try {
      result = await api('/reporter/articles', { ...snapshot, draftKey }, 'POST');
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
    window.history.replaceState(null, '', `/reporter/articles/${id}/edit`);
    document.getElementById('category').disabled = true;
  }
  // Runs tasks one after another so saves never overlap; a failed task doesn't block the next one.
  function enqueue(task) {
    const next = queue.catch(() => {}).then(task);
    queue = next;
    return next;
  }
  // Handles a failed save: keeps the changes in this browser and tells the user.
  function failed(e) {
    dirty = true;
    backup();
    message(
      window.IS_PUBLISHED
        ? 'Not submitted — your changes are kept in this browser.'
        : 'Auto-save failed — changes not saved to server. Retry by editing or pressing Save Draft.',
    );
    showError(e);
  }
  // Auto-save: sends the current fields to the server, queued behind any running save.
  // keepalive lets the request finish while the page is closing.
  function flush(keepalive = false) {
    clearTimeout(timer);
    return enqueue(async () => {
      // An edit of a published article reaches the server only when submitted.
      if (!editable || !dirty || window.IS_PUBLISHED) return;
      const snapshot = data();
      message('Saving…');
      await ensureId(snapshot);
      await api(
        `/reporter/articles/${id}/autosave`,
        { ...snapshot, revision },
        'PATCH',
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
    // Each edit marks the form dirty, updates the local copy and restarts the auto-save timer.
    input.addEventListener('input', () => {
      dirty = true;
      backup();
      if (window.IS_PUBLISHED) return message('Changes kept in this browser until you submit them');
      message('Changes not saved yet');
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(failed), id ? 1000 : 350);
    });
  }
  // Disables or enables the fields and action buttons; the category stays locked once the article exists.
  function lock(value) {
    busy = value;
    for (const k of fields) {
      document.getElementById(k).disabled = value || !editable || (k === 'category' && !!id);
    }
    for (const key of ['save-draft-btn', 'submit-btn', 'submit-update-btn']) {
      const b = document.getElementById(key);
      if (b) b.disabled = value;
    }
  }
  // Runs a button action (save, submit or submit-update): validates, confirms, saves through the queue,
  // then shows the success message and returns to /reporter after 1.5 seconds.
  async function act(kind, done) {
    if (busy || !editable) return;
    const snapshot = data();
    if (kind !== 'save' && ['title', 'summary', 'content'].some((k) => !snapshot[k].trim())) {
      showError(new Error('Title, summary and content are required.'));
      return;
    }
    if (kind !== 'save' && !confirm('Submit this content for editor review?')) return;
    clearTimeout(timer);
    lock(true);
    let leaving = false;
    try {
      await enqueue(async () => {
        await ensureId(snapshot);
        await api(`/reporter/articles/${id}/${kind}`, {
          ...snapshot,
          revision,
        });
        acknowledge(snapshot);
      });
      error.classList.add('hidden');
      leaving = true;
      // Confirm the action, then return to the dashboard; the form stays locked meanwhile.
      const success = document.getElementById('action-message');
      success.textContent = `${done} Returning to your dashboard…`;
      success.classList.remove('hidden');
      setTimeout(() => (window.location.href = '/reporter'), 1500);
    } catch (e) {
      failed(e);
    } finally {
      if (!leaving) lock(false);
    }
  }
  for (const [button, kind, done] of [
    ['save-draft-btn', 'save', '✓ Draft saved.'],
    ['submit-btn', 'submit', '✓ Article submitted for review.'],
    ['submit-update-btn', 'submit-update', '✓ Update submitted for review.'],
  ]) {
    const el = document.getElementById(button);
    if (el) el.addEventListener('click', () => act(kind, done));
  }
  document.querySelectorAll('a[href]').forEach((link) =>
    // With unsaved changes, save before following a link; modified clicks and new tabs are left alone.
    link.addEventListener('click', async (e) => {
      if (!dirty || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || link.target === '_blank')
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
  // Warn before closing the tab with unsaved changes, and keep a local copy.
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      backup();
      e.preventDefault();
      e.returnValue = '';
    }
  });
  // When the page is hidden or closed, try one last save with keepalive.
  window.addEventListener('pagehide', () => {
    if (dirty) {
      backup();
      flush(true).catch(failed);
    }
  });
  if (dirty) timer = setTimeout(() => flush().catch(failed), 350);
})();
