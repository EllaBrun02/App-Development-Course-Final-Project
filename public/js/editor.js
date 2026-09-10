(function () {
  'use strict';

  // Delete article buttons
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('Delete this article permanently? This cannot be undone.')) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/editor/articles/${id}`, { method: 'DELETE' });
        if (res.ok) {
          btn.closest('tr').remove();
        } else {
          const d = await res.json();
          alert(d.error || 'Delete failed.');
          btn.disabled = false;
        }
      } catch (e) {
        alert('Network error.');
        btn.disabled = false;
      }
    });
  });
})();
