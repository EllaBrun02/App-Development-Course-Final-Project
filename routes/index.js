const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');
const commentController = require('../controllers/commentController');
const { commentRateLimit } = require('../middleware/rateLimit');

router.get('/', publicController.getHome);
router.get('/api/articles', publicController.getArticles);
router.get('/api/weather', publicController.getWeatherData);
router.get('/article/:id', publicController.getArticlePage);
router.post('/article/:id/comments', commentRateLimit, commentController.addComment);

module.exports = router;
