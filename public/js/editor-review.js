(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;

  const actionMsg = document.getElementById('action-message');
  const returnForm = document.getElementById('return-form');
  const editorNote = document.getElementById('editor-note');

  function showMsg(text, type) {
    actionMsg.textContent = text;
    actionMsg.className = 'action-message ' + type;
    actionMsg.classList.remove('hidden');
    actionMsg.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  }

  async function apiPatch(url, body) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json() };
  }

  // Publish a new article, or approve an edit (it replaces the published version)
  const publishBtn = document.getElementById('publish-btn');
  if (publishBtn) {
    publishBtn.addEventListener('click', async () => {
      if (!confirm(publishBtn.dataset.confirm)) return;
      publishBtn.disabled = true;
      try {
        const { res, data } = await apiPatch(`/editor/articles/${ARTICLE_ID}/publish`, {});
        if (res.ok) {
          showMsg(publishBtn.dataset.success, 'success');
          setTimeout(() => window.location.href = '/editor', 1500);
        } else {
          showMsg(data.error || 'Failed.', 'error');
          publishBtn.disabled = false;
        }
      } catch (e) {
        showMsg('Network error.', 'error');
        publishBtn.disabled = false;
      }
    });
  }

  // Show return form
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      returnForm.classList.remove('hidden');
      editorNote.focus();
    });
  }

  // Cancel return
  const cancelReturnBtn = document.getElementById('cancel-return-btn');
  if (cancelReturnBtn) {
    cancelReturnBtn.addEventListener('click', () => {
      returnForm.classList.add('hidden');
      editorNote.value = '';
    });
  }

  // Send return
  const sendReturnBtn = document.getElementById('send-return-btn');
  if (sendReturnBtn) {
    sendReturnBtn.addEventListener('click', async () => {
      const note = editorNote.value.trim();
      if (!note) { alert('Please provide a note explaining what needs to be corrected.'); return; }
      sendReturnBtn.disabled = true;
      try {
        const { res, data } = await apiPatch(`/editor/articles/${ARTICLE_ID}/return`, { note });
        if (res.ok) {
          showMsg('✓ Article returned to reporter.', 'success');
          setTimeout(() => window.location.href = '/editor', 1500);
        } else {
          showMsg(data.error || 'Failed.', 'error');
          sendReturnBtn.disabled = false;
        }
      } catch (e) {
        showMsg('Network error.', 'error');
        sendReturnBtn.disabled = false;
      }
    });
  }
})();
