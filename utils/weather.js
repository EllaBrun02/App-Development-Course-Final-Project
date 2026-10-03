const fetch = require('node-fetch');
const logger = require('./logger');

let cache = null;
let inFlight = null; // audit #27: shared refresh promise
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes — the max allowed data age
let retryAt = 0;
const RETRY_DELAY = 60 * 1000;

// Uses Open-Meteo API — completely free, no API key required
// Default location: Tel Aviv, Israel
const LAT = 32.0853;
const LON = 34.7818;
const CITY = 'Tel Aviv';

const WMO_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

function getWeatherIcon(code) {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2 || code === 3) return '⛅';
  if (code >= 45 && code <= 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95) return '⛈️';
  return '🌤️';
}

const UNAVAILABLE = () => ({
  city: CITY, temp: '--', description: 'Currently unavailable', icon: '🌤️',
  windspeed: '--', fetchedAt: '-', observedAt: null, expiresAt: null, stale: true,
});

async function fetchFresh() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true&temperature_unit=celsius&timezone=GMT`;
  const res = await fetch(url, { timeout: 5000 });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  const cw = data.current_weather;
  // Open-Meteo returns GMT timestamps without an offset when timezone=GMT.
  // Fetching an old observation must not give it a new 15-minute lifetime.
  const time = cw && cw.time;
  const observed = typeof time === 'string'
    ? Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(time) ? time : `${time}Z`)
    : NaN;
  const now = Date.now();
  if (!Number.isFinite(observed) || observed > now || observed + CACHE_TTL <= now ||
      !Number.isFinite(cw.temperature) || !Number.isFinite(cw.windspeed)) {
    throw new Error('Weather observation is invalid or expired');
  }
  cache = {
    city: CITY,
    temp: Math.round(cw.temperature),
    description: WMO_CODES[cw.weathercode] || 'Unknown',
    icon: getWeatherIcon(cw.weathercode),
    windspeed: cw.windspeed,
    fetchedAt: new Date().toLocaleTimeString(),
    observedAt: new Date(observed).toISOString(),
    expiresAt: new Date(observed + CACHE_TTL).toISOString(),
    stale: false,
  };
  retryAt = 0;
  logger.info('Weather data refreshed from Open-Meteo');
  return cache;
}

async function getWeather() {
  const now = Date.now();
  if (cache && now < Date.parse(cache.expiresAt)) return cache;
  if (now < retryAt) return UNAVAILABLE();

  // Audit #27: when the cache is cold, share one in-flight request between
  // all concurrent callers instead of hitting the external API once each.
  if (!inFlight) {
    inFlight = fetchFresh().catch(err => {
      logger.error(`Weather fetch failed: ${err.message}`);
      cache = null;
      retryAt = Date.now() + RETRY_DELAY;
      return UNAVAILABLE();
    }).finally(() => { inFlight = null; });
  }

  return inFlight;
}

module.exports = { getWeather };
