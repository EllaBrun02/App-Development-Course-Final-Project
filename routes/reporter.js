const express = require('express');
const router = express.Router();
const { objectId } = require('../utils/validation');
const { requireRole } = require('../middleware/auth');
const rc = require('../controllers/reporterController');

// Reject malformed IDs before they reach a controller.
router.param('id', (req, res, next, id) => {
  try { objectId(id); next(); } catch (err) { next(err); }
});

// Middleware that lets only logged-in reporters through; used on every route below.
const isReporter = requireRole('reporter');

// Reporter dashboard, writing a new article, editing it (auto-save and manual save),
// submitting it for review and submitting an update of a published article.
router.get('/', isReporter, rc.getDashboard);
router.get('/new', isReporter, rc.getNewArticle);
router.post('/articles', isReporter, rc.createArticle);
router.get('/articles/:id/edit', isReporter, rc.getEditArticle);
router.patch('/articles/:id/autosave', isReporter, rc.autoSave);
router.patch('/articles/:id/save', isReporter, rc.saveArticle);
router.patch('/articles/:id/submit', isReporter, rc.submitForReview);
router.patch('/articles/:id/submit-update', isReporter, rc.submitUpdate);

module.exports = router;
