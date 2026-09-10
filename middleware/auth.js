function requireAuth(req, res, next) {
  if (!req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.userRole)) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Access denied' });
      }
      return res.status(403).render('error', { message: 'Access denied', code: 403 });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
