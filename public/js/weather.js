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

  async function refresh() {
    try {
      const res = await fetch('/api/weather');
      if (!res.ok) throw new Error('weather request failed');
      const { weather } = await res.json();
      setText('weather-icon', weather.icon);
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
