const User = require('../models/User');
const logger = require('../utils/logger');

// Login attempt limiting (audit #34): max 10 failed attempts per IP per
// 15 minutes. Successful login clears the counter.
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;
const failedLogins = new Map(); // ip -> [timestamp, ...]

function recentFailures(ip) {
  const now = Date.now();
  const list = (failedLogins.get(ip) || []).filter(t => now - t < FAIL_WINDOW_MS);
  failedLogins.set(ip, list);
  return list;
}

exports.getLogin = (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.userRole === 'editor' ? '/editor' : '/reporter');
  }
  res.render('login', { error: null });
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (recentFailures(ip).length >= MAX_FAILED_ATTEMPTS) {
    logger.warn(`Login rate limit hit for IP ${ip}`);
    return res.status(429).render('login', { error: 'Too many failed login attempts. Please try again in a few minutes.' });
  }

  if (!username || !password || !username.trim()) {
    return res.status(400).render('login', { error: 'Please fill in all fields.' });
  }
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user || !(await user.checkPassword(password))) {
      recentFailures(ip).push(Date.now());
      return res.status(401).render('login', { error: 'Invalid username or password.' });
    }

    failedLogins.delete(ip);

    // Audit #34: regenerate the session ID on login (prevents session fixation).
    req.session.regenerate((err) => {
      if (err) {
        logger.error(`Session regenerate error: ${err.message}`);
        return res.status(500).render('login', { error: 'Server error. Please try again.' });
      }
      req.session.userId = user._id.toString();
      req.session.userRole = user.role;
      req.session.userName = user.name;
      logger.info(`User ${user.username} (${user.role}) logged in`);
      res.redirect(user.role === 'editor' ? '/editor' : '/reporter');
    });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).render('login', { error: 'Server error. Please try again.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};
