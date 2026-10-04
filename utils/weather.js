const logger = require('./logger');

// Uses Open-Meteo — free, no API key and no credit card required.
// Default location: Tel Aviv, Israel.
const LAT = 32.0853;
const LON = 34.7818;
const CITY = 'Tel Aviv';
const API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true&temperature_unit=celsius&timezone=GMT`;

const MAX_AGE = 15 * 60 * 1000; // displayed weather may lag at most 15 minutes
const NEXT_OBSERVATION_DELAY = 2 * 1000; // ask for the next observation just after this one expires
const RETRY_DELAY = 10 * 1000; // after a failure, try again soon (one request for all visitors)
const REQUEST_TIMEOUT = 5 * 1000;

let cache = null; // the latest valid observation, shared by all visitors
let started = false;

const WMO_CODES = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

const UNAVAILABLE = () => ({
  city: CITY, temp: '--', description: 'Currently unavailable', windspeed: '--',
  observedAt: null, expiresAt: null, stale: true,
});

async function fetchObservation() {
  const res = await fetch(API_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  const cw = data.current_weather;
  // Open-Meteo returns GMT timestamps without an offset when timezone=GMT.
  // Freshness is measured from the observation time, not from our request,
  // so an old observation never gets a new 15-minute lifetime.
  const time = cw && cw.time;
  const observed = typeof time === 'string'
    ? Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(time) ? time : `${time}Z`)
    : NaN;
  const now = Date.now();
  if (!Number.isFinite(observed) || observed > now || observed + MAX_AGE <= now ||
      !Number.isFinite(cw.temperature) || !Number.isFinite(cw.windspeed)) {
    throw new Error('Weather observation is invalid or expired');
  }
  return {
    city: CITY,
    temp: Math.round(cw.temperature),
    description: WMO_CODES[cw.weathercode] || 'Unknown',
    windspeed: cw.windspeed,
    observedAt: new Date(observed).toISOString(),
    expiresAt: new Date(observed + MAX_AGE).toISOString(),
    stale: false,
  };
}

// A single background loop keeps the cache up to date. Visitors only read the
// cache, so page loads never wait for the provider, and thousands of visitors
// still cause just one provider request every 15 minutes.
async function refresh() {
  let delay;
  try {
    cache = await fetchObservation();
    logger.info('Weather data refreshed from Open-Meteo');
    // The provider publishes a new observation every 15 minutes, when this one expires.
    delay = Date.parse(cache.expiresAt) - Date.now() + NEXT_OBSERVATION_DELAY;
  } catch (err) {
    logger.error(`Weather fetch failed: ${err.message}`);
    delay = RETRY_DELAY;
  }
  setTimeout(refresh, Math.max(delay, 1000)).unref(); // the timer alone should not keep the process alive
}

function startWeatherUpdates() {
  if (started) return;
  started = true;
  refresh();
}

// The cached observation, but only while it is at most 15 minutes old.
function getWeather() {
  if (cache && Date.now() < Date.parse(cache.expiresAt)) return cache;
  return UNAVAILABLE();
}

module.exports = { getWeather, startWeatherUpdates };
