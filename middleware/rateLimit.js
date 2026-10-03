// Server-side rate limiter for comments: max 3 per minute per device.
//
// Hardened per audit #19:
//  - The device-ID cookie is HMAC-signed, so a client cannot mint arbitrary
//    valid IDs; a tampered/forged cookie is rejected and replaced.
//  - The cookie is httpOnly so page scripts cannot read or rewrite it.
//  - Deleting the cookie still yields a fresh device ID, so an additional
//    per-IP backstop limit is enforced as a second layer. A cookie alone can
//    never identify a device with certainty — this combination narrows the
//    bypass without blocking legitimate users behind a shared IP too fast.
const crypto = require('crypto');
const { getSecret } = require('../utils/secret');

const WINDOW_MS = 60 * 1000;
const MAX_COMMENTS = 3;          // per device
const MAX_PER_IP = 10;           // backstop: per IP address per minute

const store = new Map(); // key -> [timestamp, ...]

const SECRET = getSecret();

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 24);
}

function issueDeviceId(res) {
  const id = crypto.randomBytes(12).toString('hex');
  const cookieValue = `${id}.${sign(id)}`;
  res.cookie('_did', cookieValue, {
    maxAge: 365 * 24 * 3600 * 1000,
    httpOnly: true,
    sameSite: 'lax',
  });
  return id;
}

function getDeviceId(req, res) {
  const raw = req.cookies && req.cookies['_did'];
  if (raw) {
    const dot = raw.lastIndexOf('.');
    if (dot > 0) {
      const id = raw.slice(0, dot);
      const sigBuf = Buffer.from(raw.slice(dot + 1));
      const expectedBuf = Buffer.from(sign(id));
      // Compare BYTE lengths before timingSafeEqual: a multibyte character in
      // a tampered cookie passes a string-length check but makes the buffers
      // differ in size, and timingSafeEqual throws on unequal buffers.
      if (sigBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return id;
      }
    }
  }
  return issueDeviceId(res);
}

function recentHits(key, now) {
  return (store.get(key) || []).filter(t => now - t < WINDOW_MS);
}

function commentRateLimit(req, res, next) {
  const deviceId = getDeviceId(req, res);
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const deviceKey = `dev:${deviceId}`;
  const ipKey = `ip:${ip}`;
  const deviceHits = recentHits(deviceKey, now);
  const ipHits = recentHits(ipKey, now);

  if (deviceHits.length >= MAX_COMMENTS || ipHits.length >= MAX_PER_IP) {
    return res.status(429).json({
      error: `Too many comments. You can post at most ${MAX_COMMENTS} comments per minute. Please wait a moment.`,
    });
  }

  deviceHits.push(now);
  ipHits.push(now);
  store.set(deviceKey, deviceHits);
  store.set(ipKey, ipHits);

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const [key, ts] of store.entries()) {
      if (ts.every(t => now - t >= WINDOW_MS)) store.delete(key);
    }
  }

  next();
}

module.exports = { commentRateLimit };
