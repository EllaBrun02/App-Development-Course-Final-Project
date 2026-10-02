function wantsJson(req) {
  return req.method !== 'GET' || req.path?.includes('/api/') ||
    req.xhr || req.headers.accept?.includes('application/json');
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    if (wantsJson(req)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.session.userId) {
      if (wantsJson(req)) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }
    // Consult current role: CRUD may have changed or deleted the session's account.
    try {
      const user = await require('../models/User').findById(req.session.userId);
      if (!user) { req.session.destroy(() => {}); return res.status(401).json({error:'Authentication required'}); }
      req.session.userRole = user.role;
      req.session.userName = user.name;
    } catch (err) { return next(err); }
    if (!roles.includes(req.session.userRole)) {
      if (wantsJson(req)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      return res.status(403).render('error', { message: 'Access denied', code: 403 });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
