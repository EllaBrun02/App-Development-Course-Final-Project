// Server-side rate limiter for comments: max 3 per minute per device cookie.
// Uses an in-memory store (Map) keyed by device ID stored in a cookie.
const WINDOW_MS = 60 * 1000;
const MAX_COMMENTS = 3;

const store = new Map(); // deviceId -> [timestamp, ...]

function getDeviceId(req, res) {
  let id = req.cookies && req.cookies['_did'];
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    res.cookie('_did', id, { maxAge: 365 * 24 * 3600 * 1000, httpOnly: false });
  }
  return id;
}

function commentRateLimit(req, res, next) {
  const deviceId = getDeviceId(req, res);
  const now = Date.now();
  const timestamps = (store.get(deviceId) || []).filter(t => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_COMMENTS) {
    return res.status(429).json({
      error: `Too many comments. You can post at most ${MAX_COMMENTS} comments per minute. Please wait a moment.`,
    });
  }

  timestamps.push(now);
  store.set(deviceId, timestamps);

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, ts] of store.entries()) {
      if (ts.every(t => now - t >= WINDOW_MS)) store.delete(key);
    }
  }

  next();
}

module.exports = { commentRateLimit };
