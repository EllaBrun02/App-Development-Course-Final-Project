// Expire displayed values at the provider's observation deadline, even offline.
(function () {
  'use strict';

  const widget = document.getElementById('weather-widget');
  if (!widget) return;

  const REFRESH_MS = 5 * 60 * 1000; // 5 minutes
  let expiresAt = Date.parse(widget.dataset.expiresAt);
  let expiryTimer;
  let refreshing = false;

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function showUnavailable() {
    setText('weather-temp', '--');
    setText('weather-wind', 'Wind: --');
    setText('weather-desc', 'Currently unavailable');
    setText('weather-updated', '--');
    const icon = document.getElementById('weather-icon');
    if (icon) icon.innerHTML = '';
    document.getElementById('weather-stale')?.classList.remove('hidden');
  }

  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      showUnavailable();
      return;
    }
    expiryTimer = setTimeout(() => {
      showUnavailable();
      refresh();
    }, remaining);
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
    if (refreshing) return;
    refreshing = true;
    try {
      const res = await fetch('/api/weather', { cache: 'no-store' });
      if (!res.ok) throw new Error('weather request failed');
      const { weather } = await res.json();
      expiresAt = Date.parse(weather.expiresAt);
      if (weather.stale || !Number.isFinite(expiresAt) || expiresAt <= Date.now() ||
          !Number.isFinite(weather.temp) || !Number.isFinite(weather.windspeed)) {
        throw new Error('weather observation expired');
      }
      const icon = document.getElementById('weather-icon');
      if (icon) icon.innerHTML = iconSvg(String(weather.description || ''));
      setText('weather-city', weather.city);
      setText('weather-temp', `${weather.temp}°C`);
      setText('weather-desc', weather.description);
      setText('weather-wind', `Wind: ${weather.windspeed} km/h`);
      setText('weather-updated', new Date(weather.observedAt).toLocaleTimeString());
      const stale = document.getElementById('weather-stale');
      if (stale) stale.classList.toggle('hidden', !weather.stale);
      scheduleExpiry();
    } catch (e) {
      showUnavailable();
    } finally {
      refreshing = false;
    }
  }

  function resume() {
    scheduleExpiry();
    refresh();
  }

  scheduleExpiry();
  setInterval(refresh, REFRESH_MS);
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resume();
  });
})();
