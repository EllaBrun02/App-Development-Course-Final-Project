const express = require('express');
const router = express.Router();
const { objectId } = require('../utils/validation');
const { requireRole } = require('../middleware/auth');
const ec = require('../controllers/editorController');
const management = require('../controllers/managementController');

// Reject malformed IDs before they reach a controller.
router.param('id', (req, res, next, id) => {
  try { objectId(id); next(); } catch (err) { next(err); }
});

const isEditor = requireRole('editor');

// Articles: dashboard, review, edit and workflow actions
router.get('/', isEditor, ec.getDashboard);
router.get('/articles/:id/edit', isEditor, ec.getEditArticle);
router.get('/articles/:id', isEditor, ec.getArticleReview);
router.patch('/articles/:id', isEditor, ec.editArticle);
router.patch('/articles/:id/publish', isEditor, ec.publishArticle);
router.patch('/articles/:id/approve-update', isEditor, ec.approveUpdate);
router.patch('/articles/:id/return', isEditor, ec.returnArticle);
router.delete('/articles/:id', isEditor, ec.deleteArticle);

// Impact analytics (registered before the generic /api/:resource routes)
router.get('/analytics/:id', isEditor, ec.getAnalytics);
router.get('/api/analytics/:id', isEditor, ec.getAnalyticsData);

// Data management: CRUD for users, comments and view records
router.get('/manage', isEditor, management.getPage);
router.get('/api/:resource', isEditor, management.list);
router.post('/api/:resource', isEditor, management.create);
router.get('/api/:resource/:id', isEditor, management.read);
router.patch('/api/:resource/:id', isEditor, management.update);
router.delete('/api/:resource/:id', isEditor, management.remove);

module.exports = router;
