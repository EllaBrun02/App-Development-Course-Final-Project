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
  let activeRequest = null;
  let requestId = 0;
  const feedStatus = document.getElementById("feed-status");

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
      : `<div class="article-card-img"><div class="article-card-img-placeholder"><span aria-hidden="true">dw<span class="placeholder-period">.</span></span><small>${escHtml(article.category)} / The Daily Web</small></div></div>`;

    const author = article.author ? escHtml(article.author.name) : 'Unknown';
    return `
      <article class="article-card">
        <a href="/article/${article._id}" tabindex="-1" style="display:contents">
          ${imgHtml}
        </a>
        <div class="article-card-body">
          <div class="card-category">${escHtml(article.category)}</div>
          <h3 class="card-title">
            <a href="/article/${article._id}">${escHtml(article.title)}</a>
          </h3>
          <div class="card-summary">${escHtml(article.summary)}</div>
          <div class="card-meta">
            <span class="card-author">By ${author}</span>
            <span>${formatDate(article.publishedAt)}</span>
            <span class="views">${article.views || 0} views</span>
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
    if (!reset && (loading || !hasMore)) return;
    if (reset && activeRequest) activeRequest.abort();
    const id = ++requestId;
    activeRequest = new AbortController();
    loading = true;
    feed.setAttribute('aria-busy', 'true');
    if (reset) {
      page = 1;
      hasMore = true;
      feed.innerHTML = '';
      noMore.classList.add('hidden');
    }
    initialSpinner.classList.toggle('hidden', page !== 1);
    loadingMore.classList.toggle('hidden', page === 1);
    try {
      const res = await fetch(buildUrl(), { signal: activeRequest.signal });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      if (id !== requestId) return;
      data.articles.forEach(a => feed.insertAdjacentHTML('beforeend', renderCard(a)));
      hasMore = data.hasMore;
      if (page === 1 && data.articles.length === 0) {
        feed.innerHTML = '<div class="feed-empty"><h3>No stories found</h3><p>Try another search or change your filters.</p><button class="btn btn-outline" id="clear-filters">Clear filters</button></div>';
        document.getElementById('clear-filters').addEventListener('click', () => {
          currentSearch = currentCategory = currentViewed = '';
          currentSort = 'date';
          searchInput.value = categoryFilter.value = viewedFilter.value = '';
          sortSelect.value = 'date';
          resetAndLoad();
        });
      } else if (!hasMore) noMore.classList.remove('hidden');
      feedStatus.textContent = `${feed.querySelectorAll('.article-card').length} stories loaded.`;
      if (hasMore) page++;
    } catch (err) {
      if (err.name === 'AbortError' || id !== requestId) return;
      const message = document.createElement('div');
      message.className = 'feed-empty';
      message.innerHTML = '<h3>Stories couldn’t be loaded</h3><p>Check your connection and try again.</p><button class="btn btn-outline">Try again</button>';
      message.querySelector('button').addEventListener('click', () => {
        message.remove();
        hasMore = true;
        loadArticles(false);
      });
      feed.appendChild(message);
      feedStatus.textContent = 'Stories could not be loaded. Please try again.';
      hasMore = false;
    } finally {
      if (id === requestId) {
        loading = false;
        feed.setAttribute('aria-busy', 'false');
        initialSpinner.classList.add('hidden');
        loadingMore.classList.add('hidden');
      }
    }
  }

  // Infinite scroll via IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadArticles(false);
  }, { rootMargin: '300px' });
  observer.observe(document.getElementById('load-more-trigger'));

  function resetAndLoad() {
    document.querySelectorAll('.category-link').forEach(link => {
      link.setAttribute('aria-current', String(link.dataset.category === currentCategory));
    });
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
      document.getElementById('latest-news').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  });

  // Initial load
  loadArticles(true);
})();
