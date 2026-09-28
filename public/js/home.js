(function () {
  'use strict';

  // Audit #32: feed state (search/filter/sort) lives in the URL so that
  // refresh, back navigation and shared links restore the same view.
  const initialParams = new URLSearchParams(window.location.search);

  let page = 1;
  let loading = false;
  let hasMore = true;
  let currentSearch = initialParams.get('search') || '';
  let currentCategory = initialParams.get('category') || '';
  let currentViewed = initialParams.get('viewed') || '';
  let currentSort = initialParams.get('sort') || 'date';
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

  function stateParams() {
    const params = new URLSearchParams();
    if (currentSearch) params.set('search', currentSearch);
    if (currentCategory) params.set('category', currentCategory);
    if (currentViewed) params.set('viewed', currentViewed);
    if (currentSort !== 'date') params.set('sort', currentSort);
    return params;
  }

  function buildUrl() {
    const params = stateParams();
    params.set('page', page);
    return '/api/articles?' + params.toString();
  }

  // Audit #32: reflect the current filters in the address bar
  function syncUrl() {
    const qs = stateParams().toString();
    history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
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
      attachImageFallbacks();

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

  // Audit #33: an image URL that exists but fails to load falls back to the
  // same placeholder used when there is no image at all.
  function attachImageFallbacks() {
    feed.querySelectorAll('.article-card-img img:not([data-fallback])').forEach(img => {
      img.dataset.fallback = '1';
      img.addEventListener('error', () => {
        const wrap = img.closest('.article-card-img');
        if (wrap) wrap.innerHTML = '<div class="article-card-img-placeholder">📰</div>';
      });
    });
  }

  function resetAndLoad() {
    syncUrl();
    loadArticles(true);
  }

  // Restore control values from the URL state (audit #32)
  searchInput.value = currentSearch;
  categoryFilter.value = currentCategory;
  viewedFilter.value = currentViewed;
  sortSelect.value = currentSort;

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
      // Audit #31: respect the user's Reduced Motion preference
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      window.scrollTo({ top: 0, behavior });
    });
  });

  // Initial load
  loadArticles(true);
})();
