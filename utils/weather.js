const fetch = require('node-fetch');
const logger = require('./logger');

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

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

async function getWeather() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) return cache;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current_weather=true&temperature_unit=celsius`;
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const cw = data.current_weather;
    cache = {
      city: CITY,
      temp: Math.round(cw.temperature),
      description: WMO_CODES[cw.weathercode] || 'Unknown',
      icon: getWeatherIcon(cw.weathercode),
      windspeed: cw.windspeed,
      fetchedAt: new Date().toLocaleTimeString(),
    };
    cacheTime = now;
    logger.info('Weather data refreshed from Open-Meteo');
  } catch (err) {
    logger.error(`Weather fetch failed: ${err.message}`);
    if (cache) return cache; // serve stale cache on error
    cache = { city: CITY, temp: '--', description: 'Unavailable', icon: '🌤️', windspeed: '--', fetchedAt: '-' };
  }
  return cache;
}

module.exports = { getWeather };
