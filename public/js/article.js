(function () {
  'use strict';

  const form = document.getElementById('comment-form');
  if (!form) return;

  const articleId = form.dataset.articleId;
  const commentsList = document.getElementById('comments-list');
  const commentCount = document.getElementById('comment-count');
  const errorDiv = document.getElementById('comment-error');
  const authorInput = document.getElementById('comment-author');
  const bodyInput = document.getElementById('comment-body');

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');

    const author = authorInput.value.trim();
    const body = bodyInput.value.trim();

    if (!author || !body) {
      errorDiv.textContent = 'Please fill in your name and comment.';
      errorDiv.classList.remove('hidden');
      return;
    }

    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';

    try {
      const res = await fetch(`/article/${articleId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, body }),
      });

      const data = await res.json();

      if (!res.ok) {
        errorDiv.textContent = data.error || 'Failed to post comment. Please try again.';
        errorDiv.classList.remove('hidden');
        return;
      }

      // Append new comment to the list
      const c = data.comment;
      const el = document.createElement('div');
      el.className = 'comment';
      el.innerHTML = `
        <div class="comment-header">
          <strong class="comment-author">${escHtml(c.author)}</strong>
          <time class="comment-time">${formatDate(c.createdAt)}</time>
        </div>
        <p class="comment-body">${escHtml(c.body)}</p>`;
      commentsList.appendChild(el);

      // Update count
      const current = parseInt(commentCount.textContent || '0', 10);
      commentCount.textContent = current + 1;

      // Reset form
      authorInput.value = '';
      bodyInput.value = '';

      // Scroll to new comment
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      errorDiv.textContent = 'Network error. Please check your connection.';
      errorDiv.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Comment';
    }
  });
})();
