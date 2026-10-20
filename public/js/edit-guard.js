(function () {
  'use strict';

  // Edit on a published article whose edit is already waiting for review
  // shows the error next to the button instead of opening the editor.
  const error = document.createElement('div');
  error.className = 'error-message edit-blocked-error';
  error.setAttribute('role', 'alert');
  error.tabIndex = -1;

  document.querySelectorAll('[data-edit-blocked]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      error.textContent = link.dataset.editBlocked;
      link.parentElement.appendChild(error);
      // Move focus so screen readers announce the error
      error.focus();
    });
  });
})();
