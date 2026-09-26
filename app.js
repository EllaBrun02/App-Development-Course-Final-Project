const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

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
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

// Sessions — stored in MongoDB so they survive server restarts
app.use(session({
  secret: process.env.SESSION_SECRET || 'thedailyweb_secret_2024',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 1 week
}));

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
