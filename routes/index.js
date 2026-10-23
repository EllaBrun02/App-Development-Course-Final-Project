const express = require('express');
const router = express.Router();
const { objectId } = require('../utils/validation');
const publicController = require('../controllers/publicController');
const commentController = require('../controllers/commentController');
const { commentRateLimit } = require('../middleware/rateLimit');

// Reject malformed IDs before they reach a controller.
router.param('id', (req, res, next, id) => {
  try { objectId(id); next(); } catch (err) { next(err); }
});

// Public pages and APIs, no login needed: home page, article feed, weather and one article.
router.get('/', publicController.getHome);
router.get('/api/articles', publicController.getArticles);
router.get('/api/weather', publicController.getWeatherData);
router.get('/article/:id', publicController.getArticlePage);
// Anyone can post a comment, but the rate limit runs first (3 per minute).
router.post('/article/:id/comments', commentRateLimit, commentController.addComment);

module.exports = router;
