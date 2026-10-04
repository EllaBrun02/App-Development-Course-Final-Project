const User = require('../models/User');

// AJAX/API requests get JSON errors; page requests get a redirect or error page.
function wantsJson(req) {
  return req.method !== 'GET' || req.path?.includes('/api/') ||
    req.xhr || req.headers.accept?.includes('application/json');
}

function notLoggedIn(req, res) {
  if (wantsJson(req)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/login');
}

// Server-side permission check. The role comes from the user record in the
// database, never from anything the browser sends.
function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.userId) return notLoggedIn(req, res);

    // Read the current role: an editor may have changed or deleted this account.
    try {
      const user = await User.findById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return notLoggedIn(req, res);
      }
      req.session.userRole = user.role;
      req.session.userName = user.name;
    } catch (err) {
      return next(err);
    }

    if (!roles.includes(req.session.userRole)) {
      if (wantsJson(req)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      return res.status(403).render('error', { message: 'Access denied', code: 403 });
    }
    next();
  };
}

module.exports = { requireRole };
