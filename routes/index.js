const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, id) => {
  try { require('../utils/validation').objectId(id); next(); } catch (err) { next(err); }
});
const publicController = require('../controllers/publicController');
const commentController = require('../controllers/commentController');
const { commentRateLimit } = require('../middleware/rateLimit');

router.get('/', publicController.getHome);
router.get('/api/articles', publicController.getArticles);
router.get('/article/:id', publicController.getArticlePage);
router.post('/article/:id/comments', commentRateLimit, commentController.addComment);

module.exports = router;
