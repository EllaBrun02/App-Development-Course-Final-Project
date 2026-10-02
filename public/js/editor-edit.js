(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;
  const saveBtn = document.getElementById('save-btn');
  const msg = document.getElementById('edit-message');
  const form = document.getElementById('editor-edit-form');

  function showMsg(text, type) {
    msg.textContent = text;
    msg.className = 'action-message ' + type;
    msg.classList.remove('hidden');
    msg.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveBtn.disabled) return;
    const title   = document.getElementById('edit-title').value.trim();
    const summary = document.getElementById('edit-summary').value.trim();
    const content = document.getElementById('edit-content').value.trim();
    const image   = document.getElementById('edit-image').value.trim();
    const category = document.getElementById('edit-category').value;

    if (form.dataset.partial !== 'true' && (!title || !summary || !content)) {
      showMsg('Title, summary and content are required.', 'error');
      document.getElementById(!title ? 'edit-title' : !summary ? 'edit-summary' : 'edit-content').focus();
      return;
    }

    const fields = [...form.querySelectorAll('input, textarea, select')];
    const disabledBeforeSave = fields.map(field => field.disabled);
    function unlock() {
      fields.forEach((field, index) => { field.disabled = disabledBeforeSave[index]; });
      saveBtn.disabled = false;
    }
    saveBtn.disabled = true;
    fields.forEach(field => { field.disabled = true; });
    try {
      const res = await fetch(`/editor/articles/${ARTICLE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ title, summary, content, image, category, target: form.dataset.editTarget, revision: Number(form.dataset.revision) }),
      });
      const data = await res.json();
      if (res.ok) {
        form.dataset.revision = data.revision;
        showMsg('Changes saved successfully.', 'success');
        setTimeout(() => window.location.href = `/editor/articles/${ARTICLE_ID}`, 1200);
      } else {
        unlock();
        showMsg(data.error || 'Failed to save.', 'error');
        if (['title', 'summary', 'content', 'image', 'category'].includes(data.field)) {
          document.getElementById(`edit-${data.field}`).focus();
        }
      }
    } catch (e) {
      showMsg('Network error. Please try again.', 'error');
      unlock();
    }
  });
})();
