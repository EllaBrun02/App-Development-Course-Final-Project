const express = require('express');
const router = express.Router();
router.param('id', (req, res, next, id) => {
  try { require('../utils/validation').objectId(id); next(); } catch (err) { next(err); }
});
const { requireRole } = require('../middleware/auth');
const ec = require('../controllers/editorController');

const isEditor = requireRole('editor');
const management = require('../controllers/managementController');
router.get('/manage',isEditor,management.getPage);
router.get('/api/:resource',isEditor,management.list);
router.post('/api/:resource',isEditor,management.create);
router.get('/api/:resource/:id',isEditor,(req,res,next)=>req.params.resource === 'analytics' ? next() : management.read(req,res));
router.patch('/api/:resource/:id',isEditor,management.update);
router.delete('/api/:resource/:id',isEditor,management.remove);

router.get('/', isEditor, ec.getDashboard);
router.get('/articles/:id/edit', isEditor, ec.getEditArticle);
router.get('/articles/:id', isEditor, ec.getArticleReview);
router.patch('/articles/:id', isEditor, ec.editArticle);
router.patch('/articles/:id/publish', isEditor, ec.publishArticle);
router.patch('/articles/:id/approve-update', isEditor, ec.approveUpdate);
router.patch('/articles/:id/return', isEditor, ec.returnArticle);
router.delete('/articles/:id', isEditor, ec.deleteArticle);
router.get('/analytics/:id', isEditor, ec.getAnalytics);
router.get('/api/analytics/:id', isEditor, ec.getAnalyticsData);

module.exports = router;
