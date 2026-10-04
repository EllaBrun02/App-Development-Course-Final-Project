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

router.get('/', publicController.getHome);
router.get('/api/articles', publicController.getArticles);
router.get('/api/weather', publicController.getWeatherData);
router.get('/article/:id', publicController.getArticlePage);
router.post('/article/:id/comments', commentRateLimit, commentController.addComment);

module.exports = router;
