const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const { getSecret } = require('./utils/secret');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/the-daily-web';

// Connect to DB
connectDB();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsing
// Allow the validated 100,000-character body, including multi-byte UTF-8 text.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use((req, res, next) => {
  if (req.body !== undefined && (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'Request body must be an object.' });
  }
  next();
});

// Cookie parser (minimal - read cookies for device ID)
app.use((req, res, next) => {
  req.cookies = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach(pair => {
    const [k, ...v] = pair.split('=');
    if (k) req.cookies[k.trim()] = decodeURIComponent(v.join('=').trim());
  });
  next();
});

// HTTP request logging
const logStream = fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' });
app.use(morgan('combined', { stream: logStream }));

// Sessions — stored in MongoDB so they survive server restarts.
// Audit #34: no known default secret (env var or a locally persisted random
// secret), and the cookie is httpOnly + SameSite=Lax as a CSRF mitigation.
app.use(session({
  secret: getSecret(),
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// CSRF mitigation (audit #34): for state-changing requests, if the browser
// sent an Origin (or Referer) header, it must match the host we serve.
// Requests from other sites are rejected before reaching any route.
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const source = req.headers.origin || req.headers.referer;
  if (!source) return next(); // non-browser client (e.g. curl) — session auth still applies
  try {
    if (new URL(source).host !== req.headers.host) {
      logger.warn(`Cross-origin ${req.method} ${req.originalUrl} blocked (from ${source})`);
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    }
  } catch (e) {
    return res.status(403).json({ error: 'Invalid request origin' });
  }
  next();
});

// Routes
app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/reporter', require('./routes/reporter'));
app.use('/editor', require('./routes/editor'));

// 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found', code: 404 });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack}`);
  require('./utils/validation').errorResponse(err, req, res);
});

app.listen(PORT, () => {
  logger.info(`The Daily Web server running on http://localhost:${PORT}`);
});

module.exports = app;
