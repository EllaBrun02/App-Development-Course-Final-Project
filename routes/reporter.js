const express = require('express');
const router = express.Router();
const { objectId } = require('../utils/validation');
const { requireRole } = require('../middleware/auth');
const rc = require('../controllers/reporterController');

// Reject malformed IDs before they reach a controller.
router.param('id', (req, res, next, id) => {
  try { objectId(id); next(); } catch (err) { next(err); }
});

const isReporter = requireRole('reporter');

router.get('/', isReporter, rc.getDashboard);
router.get('/new', isReporter, rc.getNewArticle);
router.post('/articles', isReporter, rc.createArticle);
router.get('/articles/:id/edit', isReporter, rc.getEditArticle);
router.patch('/articles/:id/autosave', isReporter, rc.autoSave);
router.patch('/articles/:id/save', isReporter, rc.saveArticle);
router.patch('/articles/:id/submit', isReporter, rc.submitForReview);
router.patch('/articles/:id/submit-update', isReporter, rc.submitUpdate);

module.exports = router;
