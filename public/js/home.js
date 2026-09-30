(function () {
  'use strict';

  let page = 1;
  let loading = false;
  let hasMore = true;
  let currentSearch = '';
  let currentCategory = '';
  let currentViewed = '';
  let currentSort = 'date';
  let debounceTimer = null;

  const feed = document.getElementById('articles-feed');
  const loadingMore = document.getElementById('loading-more');
  const noMore = document.getElementById('no-more');
  const initialSpinner = document.getElementById('initial-spinner');
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const categoryFilter = document.getElementById('category-filter');
  const viewedFilter = document.getElementById('viewed-filter');
  const sortSelect = document.getElementById('sort-select');

  function buildUrl() {
    const params = new URLSearchParams();
    params.set('page', page);
    if (currentSearch) params.set('search', currentSearch);
    if (currentCategory) params.set('category', currentCategory);
    if (currentViewed) params.set('viewed', currentViewed);
    if (currentSort !== 'date') params.set('sort', currentSort);
    return '/api/articles?' + params.toString();
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderCard(article) {
    const imgHtml = article.image
      ? `<div class="article-card-img"><img src="${escHtml(article.image)}" alt="${escHtml(article.title)}" loading="lazy"></div>`
      : `<div class="article-card-img"><div class="article-card-img-placeholder">📰</div></div>`;

    const author = article.author ? escHtml(article.author.name) : 'Unknown';
    return `
      <article class="article-card">
        <a href="/article/${article._id}" tabindex="-1" style="display:contents">
          ${imgHtml}
        </a>
        <div class="article-card-body">
          <div class="card-category">${escHtml(article.category)}</div>
          <div class="card-title">
            <a href="/article/${article._id}">${escHtml(article.title)}</a>
          </div>
          <div class="card-summary">${escHtml(article.summary)}</div>
          <div class="card-meta">
            <span>✍️ ${author}</span>
            <span>📅 ${formatDate(article.publishedAt)}</span>
            <span class="views">👁 ${article.views || 0}</span>
          </div>
        </div>
      </article>`;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function loadArticles(reset) {
    if (loading) return;
    if (!hasMore && !reset) return;
    loading = true;

    if (reset) {
      page = 1;
      hasMore = true;
      feed.innerHTML = '';
      noMore.classList.add('hidden');
    }

    if (page === 1) initialSpinner.classList.remove('hidden');
    else loadingMore.classList.remove('hidden');

    try {
      const res = await fetch(buildUrl());
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();

      initialSpinner.classList.add('hidden');
      loadingMore.classList.add('hidden');

      data.articles.forEach(a => {
        feed.insertAdjacentHTML('beforeend', renderCard(a));
      });

      hasMore = data.hasMore;
      if (hasMore) page++;
      else noMore.classList.remove('hidden');
    } catch (err) {
      initialSpinner.classList.add('hidden');
      loadingMore.classList.add('hidden');
      if (page === 1) feed.innerHTML = '<div class="loading-spinner">Failed to load articles. Please refresh.</div>';
    }
    loading = false;
  }

  // Infinite scroll via IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadArticles(false);
  }, { rootMargin: '300px' });
  observer.observe(document.getElementById('load-more-trigger'));

  function resetAndLoad() {
    loadArticles(true);
  }

  searchBtn.addEventListener('click', () => {
    currentSearch = searchInput.value.trim();
    resetAndLoad();
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { currentSearch = searchInput.value.trim(); resetAndLoad(); }
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearch = searchInput.value.trim();
      resetAndLoad();
    }, 400);
  });

  categoryFilter.addEventListener('change', () => {
    currentCategory = categoryFilter.value;
    resetAndLoad();
  });

  viewedFilter.addEventListener('change', () => {
    currentViewed = viewedFilter.value;
    resetAndLoad();
  });

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    resetAndLoad();
  });

  // Sidebar category links
  document.querySelectorAll('.category-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const cat = link.dataset.category;
      currentCategory = cat;
      categoryFilter.value = cat;
      resetAndLoad();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Initial load
  loadArticles(true);
})();
