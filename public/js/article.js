// Article page: posts a reader comment with fetch and adds it to the list without a reload.
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

  // Escapes HTML characters so comment text is shown as text, not run as markup.
  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Formats a date like the server-rendered comments, e.g. "Oct 21, 2026".
  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // Respect Reduced Motion, and move focus to errors so
  // assistive technology announces them
  function scrollBehavior() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  // Shows a message in the error box and focuses it.
  function showError(msg) {
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
    errorDiv.focus();
  }

  // Checks the fields, sends the comment, then shows it at the end of the list
  // and raises the comment count.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.classList.add('hidden');

    const author = authorInput.value.trim();
    const body = bodyInput.value.trim();

    if (!author || !body) {
      showError('Please fill in your name and comment.');
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
        showError(data.error || 'Failed to post comment. Please try again.');
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
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    } catch (err) {
      showError('Network error. Please check your connection.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Comment';
    }
  });
})();
