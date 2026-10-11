const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const Comment = require('../models/Comment');
const logger = require('../utils/logger');
const v = require('../utils/validation');
const { diffWords } = require('../utils/diff');

const DASHBOARD_PAGE_SIZE = 50;

exports.getDashboard = async (req, res) => {
  try {
    const { status, category, search } = req.query;
    const query = {};
    if (search !== undefined) {
      v.text(search, 'search', 200);
      query.title = { $regex: v.literal(search), $options: 'i' };
    }
    if (status && !['draft', 'pending', 'published', 'returned'].includes(status))
      v.bad('Invalid status');
    if (category && !Article.CATEGORIES.includes(category)) v.bad('Invalid category');
    if (status) query.status = status;
    if (category) query.category = category;

    // Paginate instead of loading every article at once,
    // so the dashboard stays fast with thousands of articles.
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;

    const totalCount = await Article.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalCount / DASHBOARD_PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    const articles = await Article.find(query)
      .select('title status category author publishedAt createdAt revisionOf')
      .populate('author', 'name')
      .populate('revisionOf', 'title')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * DASHBOARD_PAGE_SIZE)
      .limit(DASHBOARD_PAGE_SIZE);
    // The edit (if any) of each published article on this page, for its Edit button.
    const published = articles.filter((a) => a.status === 'published').map((a) => a._id);
    const edits = new Map(
      (await Article.find({ revisionOf: { $in: published } }).select('status revisionOf'))
        .map((e) => [String(e.revisionOf), e]),
    );

    res.render('editor/dashboard', {
      articles,
      edits,
      editPending: Article.EDIT_PENDING,
      categories: Article.CATEGORIES,
      search: search || '',
      filterStatus: status || '',
      filterCategory: category || '',
      page,
      totalPages,
      totalCount,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Editor dashboard error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

exports.getArticleReview = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id)
      .populate('author', 'name')
      .populate('revisionOf');
    if (!article) return res.status(404).render('error', { message: 'Not found', code: 404 });
    // An edit is compared with the published article it will replace.
    const original = article.revisionOf;
    const diffs = original
      ? [['title', 'Title'], ['summary', 'Summary'], ['content', 'Content']].map(([key, label]) => ({
          label,
          changed: (original[key] || '') !== (article[key] || ''),
          parts: diffWords(original[key], article[key]),
        }))
      : [];
    const edit = article.status === 'published'
      ? await Article.findOne({ revisionOf: article._id }).select('status')
      : null;
    res.render('editor/article-review', {
      article,
      original,
      diffs,
      edit,
      editPending: Article.EDIT_PENDING,
      categories: Article.CATEGORIES,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Article review error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// A published article is never changed in place: editing it creates a new
// pending article linked to it, and the live version stays until approval.
exports.getEditArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('author', 'name');
    if (!article) v.bad('Not found', 404);
    if (article.status === 'published') {
      const edit = await Article.findOne({ revisionOf: article._id }).select('status');
      if (edit?.status === 'pending') v.bad(Article.EDIT_PENDING, 409);
      if (edit) return res.redirect(`/editor/articles/${edit._id}/edit`);
    }
    res.render('editor/article-edit', {
      article,
      categories: Article.CATEGORIES,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};

exports.editArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) v.bad('Not found', 404);
    v.revision(article, req.body);
    if (req.body.category !== undefined && !Article.CATEGORIES.includes(req.body.category))
      v.bad('Invalid category');
    // The category of a published article (and of its edit) stays fixed.
    const fixedCategory = article.status === 'published' || article.revisionOf;
    if (fixedCategory && req.body.category !== undefined && req.body.category !== article.category)
      v.bad('Category cannot change while editing a published article');

    if (article.status === 'published') {
      const edit = await Article.submitEdit(article, v.content(req.body, true));
      logger.info(`Edit ${edit._id} of published article ${article._id} created by editor ${req.session.userId}`);
      return res.json({ ok: true, id: edit._id });
    }
    Object.assign(article, v.content(req.body, article.status !== 'draft'));
    if (req.body.category !== undefined) article.category = req.body.category;
    article.autoSave = undefined;
    await article.save();
    logger.info(`Article ${article._id} edited by editor ${req.session.userId}`);
    res.json({ ok: true, revision: article.__v });
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};

// Approve a pending article. A new article is simply published; an edit of a
// published article replaces it: the original is deleted and the edit becomes
// the published article, taking over its comments, views and analytics.
exports.publishArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    if (article.status !== 'pending')
      return res.status(400).json({ error: 'Article is not pending.' });

    let original = null;
    if (article.revisionOf) {
      original = await Article.findOne({ _id: article.revisionOf, status: 'published' });
      if (!original) v.bad('The published article this edit belongs to no longer exists', 409);
      article.views = original.views;
      article.replaces = [original._id, ...original.replaces];
      article.revisionOf = undefined;
    }

    const publishedAt = new Date();
    v.content(article.toObject(), true);
    article.status = 'published';
    article.publishedAt = publishedAt;
    article.editorNote = '';
    // Saved first: optimistic concurrency stops a second, simultaneous approval here.
    await article.save();

    if (original) {
      await Promise.all([
        Comment.updateMany({ article: original._id }, { $set: { article: article._id } }),
        ViewStat.updateMany({ article: original._id }, { $set: { article: article._id } }),
      ]);
      await Article.deleteOne({ _id: original._id });
    }

    // Record publish event in view stats (after the move, so it joins the same hour bucket)
    await recordPublishEvent(article._id, publishedAt);

    logger.info(original
      ? `Edit ${article._id} approved by editor ${req.session.userId}; it replaced article ${original._id}`
      : `Article ${article._id} published by editor ${req.session.userId}`);
    res.json({ ok: true, id: article._id });
  } catch (err) {
    logger.error(`Publish error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Return article to reporter with a note
exports.returnArticle = async (req, res) => {
  try {
    const { note } = req.body;
    v.text(note, 'editor note', 2000, true);
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    if (article.status !== 'pending') return res.status(400).json({ error: 'Not pending.' });
    article.status = 'returned';
    article.editorNote = note || '';
    await article.save();

    logger.info(`Article ${article._id} returned to reporter by editor ${req.session.userId}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Return article error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Delete article
exports.deleteArticle = async (req, res) => {
  try {
    const deleted = await Article.findByIdAndDelete(req.params.id);
    if (!deleted) v.bad('Not found', 404);

    // Also remove related data so no orphaned records (comments, view stats,
    // an edit waiting for review) point at an article that no longer exists.
    // Deleting an edit itself frees its published article for a new edit.
    const [comments, stats, edits] = await Promise.all([
      Comment.deleteMany({ article: deleted._id }),
      ViewStat.deleteMany({ article: deleted._id }),
      Article.deleteMany({ revisionOf: deleted._id }),
    ]);

    logger.info(
      `Article ${req.params.id} deleted by editor ${req.session.userId} ` +
        `(removed ${comments.deletedCount} comments, ${stats.deletedCount} view-stat records, ` +
        `${edits.deletedCount} pending edits)`,
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Delete error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Analytics: view stats for an article
exports.getAnalytics = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('author', 'name');
    if (!article) return res.status(404).render('error', { message: 'Not found', code: 404 });

    res.render('editor/analytics', {
      article,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Analytics page error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Analytics API: return time-series data
exports.getAnalyticsData = async (req, res) => {
  try {
    // Filter the requested time range on the server instead of
    // shipping the article's entire view history to the browser every time.
    const query = { article: req.params.id };
    const hours = parseInt(req.query.hours, 10);
    if (Number.isFinite(hours) && hours > 0) {
      query.hour = { $gte: new Date(Date.now() - hours * 3600 * 1000) };
    }
    const stats = await ViewStat.find(query).sort({ hour: 1 });
    res.json({ stats });
  } catch (err) {
    logger.error(`Analytics data error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

async function recordPublishEvent(articleId, time) {
  const hour = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours());
  try {
    await ViewStat.findOneAndUpdate(
      { article: articleId, hour },
      { $push: { publishEvents: time } },
      { upsert: true },
    );
  } catch (err) {
    logger.error(`Publish event record error: ${err.message}`);
  }
}
