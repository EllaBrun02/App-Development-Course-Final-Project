(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;
  const saveBtn = document.getElementById('save-btn');
  const msg = document.getElementById('edit-message');

  function showMsg(text, type) {
    msg.textContent = text;
    msg.className = 'action-message ' + type;
    msg.classList.remove('hidden');
    msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  saveBtn.addEventListener('click', async () => {
    const title   = document.getElementById('edit-title').value.trim();
    const summary = document.getElementById('edit-summary').value.trim();
    const content = document.getElementById('edit-content').value.trim();
    const image   = document.getElementById('edit-image').value.trim();
    const category = document.getElementById('edit-category').value;

    if (!title || !summary || !content) {
      showMsg('Title, summary and content are required.', 'error');
      return;
    }

    saveBtn.disabled = true;
    try {
      const res = await fetch(`/editor/articles/${ARTICLE_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary, content, image, category }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Changes saved successfully.', 'success');
        setTimeout(() => window.location.href = `/editor/articles/${ARTICLE_ID}`, 1200);
      } else {
        showMsg(data.error || 'Failed to save.', 'error');
        saveBtn.disabled = false;
      }
    } catch (e) {
      showMsg('Network error. Please try again.', 'error');
      saveBtn.disabled = false;
    }
  });
})();
