// Audit #26: a page that stays open refreshes its weather widget periodically
// so the shown data never silently exceeds the 15-minute freshness limit.
(function () {
  'use strict';

  const widget = document.getElementById('weather-widget');
  if (!widget) return;

  const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // Mirrors the icon choice in views/partials/weather.ejs so the SVG stays
  // in sync with the refreshed description (review finding #2).
  function iconSvg(description) {
    const open = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    let body;
    if (/clear/i.test(description)) {
      body = '<circle cx="24" cy="24" r="9"/><path d="M24 3v6m0 30v6M3 24h6m30 0h6M9 9l4 4m22 22 4 4M9 39l4-4m22-22 4-4"/>';
    } else if (/snow/i.test(description)) {
      body = '<path d="M24 4v40M7 14l34 20M7 34l34-20M19 8l5 5 5-5M19 40l5-5 5 5"/>';
    } else {
      body = '<path d="M12 32a8 8 0 0 1-1-16 12 12 0 0 1 23-1 9 9 0 0 1 2 17Z"/>';
      if (/rain|drizzle|shower|thunder/i.test(description)) {
        body += '<path d="m16 38-2 5m12-5-2 5m12-5-2 5"/>';
      }
    }
    return open + body + '</svg>';
  }

  async function refresh() {
    try {
      const res = await fetch('/api/weather');
      if (!res.ok) throw new Error('weather request failed');
      const { weather } = await res.json();
      const icon = document.getElementById('weather-icon');
      if (icon) icon.innerHTML = iconSvg(String(weather.description || ''));
      setText('weather-city', weather.city);
      setText('weather-temp', `${weather.temp}°C`);
      setText('weather-desc', weather.description);
      setText('weather-wind', `Wind: ${weather.windspeed} km/h`);
      setText('weather-updated', weather.fetchedAt);
      const stale = document.getElementById('weather-stale');
      if (stale) stale.classList.toggle('hidden', !weather.stale);
    } catch (e) {
      const stale = document.getElementById('weather-stale');
      if (stale) stale.classList.remove('hidden');
    }
  }

  setInterval(refresh, REFRESH_MS);
})();
