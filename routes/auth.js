const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, id) => {
  try { require('../utils/validation').objectId(id); next(); } catch (err) { next(err); }
});
const authController = require('../controllers/authController');

router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.get('/logout', authController.logout);

module.exports = router;
