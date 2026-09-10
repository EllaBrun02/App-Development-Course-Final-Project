const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const ec = require('../controllers/editorController');

const isEditor = requireRole('editor');

router.get('/', isEditor, ec.getDashboard);
router.get('/articles/:id', isEditor, ec.getArticleReview);
router.patch('/articles/:id', isEditor, ec.editArticle);
router.patch('/articles/:id/publish', isEditor, ec.publishArticle);
router.patch('/articles/:id/approve-update', isEditor, ec.approveUpdate);
router.patch('/articles/:id/return', isEditor, ec.returnArticle);
router.delete('/articles/:id', isEditor, ec.deleteArticle);
router.get('/analytics/:id', isEditor, ec.getAnalytics);
router.get('/api/analytics/:id', isEditor, ec.getAnalyticsData);

module.exports = router;
