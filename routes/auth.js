const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Login page, login form submission and logout; open to everyone.
router.get('/login', authController.getLogin);
router.post('/login', authController.postLogin);
router.get('/logout', authController.logout);

module.exports = router;
