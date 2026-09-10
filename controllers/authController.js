const User = require('../models/User');
const logger = require('../utils/logger');

exports.getLogin = (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.userRole === 'editor' ? '/editor' : '/reporter');
  }
  res.render('login', { error: null });
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Please fill in all fields.' });
  }
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user || !(await user.checkPassword(password))) {
      return res.render('login', { error: 'Invalid username or password.' });
    }
    req.session.userId = user._id.toString();
    req.session.userRole = user.role;
    req.session.userName = user.name;
    logger.info(`User ${user.username} (${user.role}) logged in`);
    res.redirect(user.role === 'editor' ? '/editor' : '/reporter');
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.render('login', { error: 'Server error. Please try again.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => res.redirect('/'));
};
