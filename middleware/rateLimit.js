// Three attempts in a rolling minute per signed device AND per IP address.
// The conservative IP fallback closes cookie-reset bypasses, at the cost of
// sharing an allowance between people on the same network. Cookies cannot
// prove physical-device identity. MongoDB keeps windows across restarts and
// makes simultaneous requests through different server processes atomic.
const crypto = require('crypto');
const mongoose = require('mongoose');
const { getSecret } = require('../utils/secret');
const logger = require('../utils/logger');

const WINDOW_MS = 60 * 1000;
const MAX_COMMENTS = 3;
let indexReady;

const SECRET = getSecret();

// Short HMAC of a value with the app secret: signs device cookies and hides raw keys.
function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 24);
}

// Creates a random device ID and stores it, signed, in a one-year httpOnly cookie.
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

// Returns the device ID from the cookie if its signature is valid; otherwise issues a new one.
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

// Records one attempt for this IP or device if it has fewer than MAX_COMMENTS in the
// last minute. Returns false when the limit is already reached.
async function reserveAttempt(kind, value, now) {
  // Infrastructure collection, like the session store; no article/user data.
  const store = mongoose.connection.collection('commentLimits');
  if (!indexReady) {
    indexReady = store.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .catch(err => { indexReady = null; throw err; });
  }
  await indexReady;
  const key = `${kind}:${sign(value)}`; // do not store raw IP addresses
  const expiresAt = new Date(now + WINDOW_MS);
  try {
    await store.updateOne({ _id: key }, { $setOnInsert: { hits: [], expiresAt } }, { upsert: true });
  } catch (err) {
    // Another process can create the same key while this request is starting.
    if (err.code !== 11000) throw err;
  }
  const recent = { $filter: { input: '$hits', as: 'hit', cond: { $gt: ['$$hit', now - WINDOW_MS] } } };
  const result = await store.updateOne(
    { _id: key, $expr: { $lt: [{ $size: recent }, MAX_COMMENTS] } },
    [{ $set: { hits: { $concatArrays: [recent, [now]] }, expiresAt } }],
  );
  // The conditional update is atomic; a fourth concurrent claim cannot win.
  return result.modifiedCount === 1;
}

// Middleware for the comment route: both the IP and the device must have an attempt left,
// otherwise 429. If MongoDB fails, comments are refused (503) rather than left unlimited.
async function commentRateLimit(req, res, next) {
  try {
    const deviceId = getDeviceId(req, res);
    // Express does not trust forwarded IP headers in this app.
    const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const now = Date.now();
    const ipAllowed = await reserveAttempt('ip', ip, now);
    const deviceAllowed = ipAllowed && await reserveAttempt('device', deviceId, now);
    if (!deviceAllowed) {
      res.set('Retry-After', '60');
      return res.status(429).json({
        error: 'Too many comments. Please wait one minute. The limit is 3 attempts per minute per device and shared network.',
      });
    }
    next();
  } catch (err) {
    logger.error(`Comment limit unavailable: ${err.message}`);
    res.status(503).json({ error: 'Comments are temporarily unavailable. Please try again shortly.' });
  }
}

module.exports = { commentRateLimit };
