// Every page: replaces article images that fail to load with a placeholder image.
(function () {
  'use strict';
  // Swaps a broken image for the placeholder (only images marked with data-image-fallback).
  function useFallback(img) {
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-image-fallback')) return;
    // Remove the marker first, so even a missing fallback cannot cause a loop.
    img.removeAttribute('data-image-fallback');
    img.src = '/images/article-placeholder.svg';
  }
  // Capture also handles cards added later by infinite scrolling.
  document.addEventListener('error', event => useFallback(event.target), true);
  document.querySelectorAll('img[data-image-fallback]').forEach(img => {
    if (img.complete && img.naturalWidth === 0) useFallback(img);
  });
})();
