(function () {
  'use strict';

  const ARTICLE_ID = window.ARTICLE_ID;
  const IS_PUBLISHED = window.IS_PUBLISHED;
  const HAS_PENDING_UPDATE = window.HAS_PENDING_UPDATE;
  const form = document.getElementById('article-form');
  const autosaveStatus = document.getElementById('autosave-status');
  const formError = document.getElementById('form-error');

  if (!form) return;

  function getFormData() {
    return {
      title: (document.getElementById('title') || {}).value || '',
      content: (document.getElementById('content') || {}).value || '',
      summary: (document.getElementById('summary') || {}).value || '',
      image: (document.getElementById('image') || {}).value || '',
      category: (document.getElementById('category') || {}).value || '',
    };
  }

  function showError(msg) {
    formError.textContent = msg;
    formError.classList.remove('hidden');
    formError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideError() { formError.classList.add('hidden'); }

  function validate() {
    const d = getFormData();
    if (!d.title.trim()) { showError('Title is required.'); return false; }
    if (!d.content.trim()) { showError('Article content is required.'); return false; }
    if (!d.summary.trim()) { showError('Summary is required.'); return false; }
    hideError();
    return true;
  }

  // Auto-save: debounced, every 3s after last change
  let autoSaveTimer = null;
  let lastSaved = null;

  function scheduleAutoSave() {
    if (!ARTICLE_ID) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(doAutoSave, 3000);
  }

  async function doAutoSave() {
    if (!ARTICLE_ID) return;
    const data = { ...getFormData(), isUpdate: IS_PUBLISHED };
    try {
      const res = await fetch(`/reporter/articles/${ARTICLE_ID}/autosave`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const result = await res.json();
        lastSaved = new Date(result.savedAt);
        autosaveStatus.textContent = `✓ Auto-saved at ${lastSaved.toLocaleTimeString()}`;
      }
    } catch (e) {
      autosaveStatus.textContent = '⚠ Auto-save failed';
    }
  }

  // Listen for changes to trigger auto-save
  ['title', 'content', 'summary', 'image'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', scheduleAutoSave);
  });

  // Save draft button
  const saveDraftBtn = document.getElementById('save-draft-btn');
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', async () => {
      if (!validate()) return;
      const data = getFormData();
      saveDraftBtn.disabled = true;
      saveDraftBtn.textContent = 'Saving...';
      try {
        const url = ARTICLE_ID
          ? `/reporter/articles/${ARTICLE_ID}/save`
          : '/reporter/articles';
        const method = ARTICLE_ID ? 'PATCH' : 'POST';
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) { showError(result.error || 'Save failed.'); return; }
        if (!ARTICLE_ID && result.id) {
          // New article created, redirect to edit page
          window.location.href = `/reporter/articles/${result.id}/edit`;
        } else {
          autosaveStatus.textContent = '✓ Draft saved';
        }
      } catch (e) {
        showError('Network error during save.');
      } finally {
        saveDraftBtn.disabled = false;
        saveDraftBtn.textContent = 'Save Draft';
      }
    });
  }

  // Submit for review
  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      if (!validate()) return;
      if (!confirm('Submit this article for editor review?')) return;
      const data = getFormData();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      try {
        if (!ARTICLE_ID) {
          // First create the article, then submit
          const createRes = await fetch('/reporter/articles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const created = await createRes.json();
          if (!createRes.ok) { showError(created.error || 'Create failed.'); return; }
          const submitRes = await fetch(`/reporter/articles/${created.id}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (!submitRes.ok) { showError('Submission failed.'); return; }
          window.location.href = '/reporter';
        } else {
          const res = await fetch(`/reporter/articles/${ARTICLE_ID}/submit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          const result = await res.json();
          if (!res.ok) { showError(result.error || 'Submission failed.'); return; }
          window.location.href = '/reporter';
        }
      } catch (e) {
        showError('Network error during submission.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for Review';
      }
    });
  }

  // Submit update to published article
  const submitUpdateBtn = document.getElementById('submit-update-btn');
  if (submitUpdateBtn) {
    submitUpdateBtn.addEventListener('click', async () => {
      if (!validate()) return;
      if (!confirm('Submit this update for editor review? The current published version will remain live until approved.')) return;
      const data = getFormData();
      submitUpdateBtn.disabled = true;
      submitUpdateBtn.textContent = 'Submitting...';
      try {
        const res = await fetch(`/reporter/articles/${ARTICLE_ID}/submit-update`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) { showError(result.error || 'Failed.'); return; }
        window.location.href = '/reporter';
      } catch (e) {
        showError('Network error.');
      } finally {
        submitUpdateBtn.disabled = false;
        submitUpdateBtn.textContent = 'Submit Update for Review';
      }
    });
  }

  // Warn before leaving with unsaved changes
  let isDirty = false;
  ['title', 'content', 'summary', 'image'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { isDirty = true; });
  });
  window.addEventListener('beforeunload', e => {
    if (isDirty) { e.preventDefault(); e.returnValue = ''; }
  });
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', () => { isDirty = false; });
  });
})();
