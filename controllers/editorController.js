const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const Comment = require('../models/Comment');
const logger = require('../utils/logger');
const v = require('../utils/validation');

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
    if (status === 'pending')
      query.$or = [
        { status: 'pending' },
        { status: 'published', 'pendingUpdate.status': 'pending' },
      ];
    else if (status) query.status = status;
    if (category) query.category = category;

    // Paginate instead of loading every article at once,
    // so the dashboard stays fast with thousands of articles.
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;

    const totalCount = await Article.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalCount / DASHBOARD_PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    const articles = await Article.find(query)
      .select('title status category author publishedAt createdAt pendingUpdate')
      .populate('author', 'name')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * DASHBOARD_PAGE_SIZE)
      .limit(DASHBOARD_PAGE_SIZE);

    res.render('editor/dashboard', {
      articles,
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
    const article = await Article.findById(req.params.id).populate('author', 'name');
    if (!article) return res.status(404).render('error', { message: 'Not found', code: 404 });
    res.render('editor/article-review', {
      article,
      categories: Article.CATEGORIES,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Article review error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Two edit targets: "main" edits an unpublished article directly; "update"
// edits a published article through its pending update, so the live version
// stays unchanged until an editor approves the update.
exports.getEditArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('author', 'name');
    if (!article) v.bad('Not found', 404);
    const target = req.query.target || (article.status === 'published' ? 'update' : 'main');
    if (!['main', 'update'].includes(target)) v.bad('Invalid target');
    if (target === 'main' && article.status === 'published')
      v.bad('Published content must be changed through a pending update', 409);
    if (target === 'update' && article.status !== 'published')
      v.bad('Only published articles can receive an update', 409);
    res.render('editor/article-edit', {
      article,
      editTarget: target,
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
    const target = req.body.target;
    if (!['main', 'update'].includes(target)) v.bad('Choose the version to edit');
    if (req.body.category !== undefined && !Article.CATEGORIES.includes(req.body.category))
      v.bad('Invalid category');
    if (target === 'update') {
      if (article.status !== 'published')
        v.bad('Only published articles can receive an update', 409);
      if (req.body.category !== undefined && req.body.category !== article.category)
        v.bad('Category cannot change while editing a published article');
      const data = v.content(req.body, true);
      if (article.pendingUpdate?.status === 'pending') {
        // Correct the update that is already waiting for approval.
        Object.assign(article.pendingUpdate, data);
        article.pendingUpdate.autoSave = undefined;
      } else {
        // Editor edits live content: store it as a new pending update.
        article.pendingUpdate = {
          ...data,
          status: 'pending',
          editorNote: '',
          submittedAt: new Date(),
        };
      }
    } else {
      if (article.status === 'published')
        v.bad('Published content must be changed through a pending update', 409);
      Object.assign(article, v.content(req.body, article.status !== 'draft'));
      if (req.body.category !== undefined) article.category = req.body.category;
      article.autoSave = undefined;
    }
    await article.save();
    logger.info(`Article ${article._id} (${target} version) edited by editor ${req.session.userId}`);
    res.json({ ok: true, revision: article.__v });
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};

// Approve main article (publish it)
exports.publishArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    if (article.status !== 'pending')
      return res.status(400).json({ error: 'Article is not pending.' });

    const publishedAt = new Date();
    v.content(article.toObject(), true);
    article.status = 'published';
    article.publishedAt = publishedAt;
    article.editorNote = '';
    await article.save();

    // Record publish event in view stats
    await recordPublishEvent(article._id, publishedAt);

    logger.info(`Article ${article._id} published by editor ${req.session.userId}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Publish error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Approve pending update to published article
exports.approveUpdate = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article || article.status !== 'published')
      return res.status(404).json({ error: 'Not found' });
    if (!article.pendingUpdate || article.pendingUpdate.status !== 'pending') {
      return res.status(400).json({ error: 'No pending update.' });
    }

    v.content(
      article.pendingUpdate.toObject ? article.pendingUpdate.toObject() : article.pendingUpdate,
      true,
    );
    const updateTime = new Date();
    article.title = article.pendingUpdate.title;
    article.content = article.pendingUpdate.content;
    article.summary = article.pendingUpdate.summary;
    article.image = article.pendingUpdate.image;
    article.publishedAt = updateTime;
    article.pendingUpdate = undefined;
    await article.save();

    await recordPublishEvent(article._id, updateTime);

    logger.info(`Article ${article._id} update approved by editor ${req.session.userId}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Approve update error: ${err.message}`);
    v.errorResponse(err, req, res);
  }
};

// Return article to reporter with a note
exports.returnArticle = async (req, res) => {
  try {
    const { note } = req.body;
    v.text(note, 'editor note', 2000, true);
    const isUpdate = v.boolean(req.body.isUpdate, 'isUpdate');
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });

    if (isUpdate) {
      if (article.status !== 'published' || article.pendingUpdate?.status !== 'pending')
        return res.status(409).json({ error: 'No pending update.' });
      article.pendingUpdate.status = 'returned';
      article.pendingUpdate.editorNote = note || '';
    } else {
      if (article.status !== 'pending') return res.status(400).json({ error: 'Not pending.' });
      article.status = 'returned';
      article.editorNote = note || '';
    }
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

    // Also remove related data so no orphaned records
    // (comments, view stats) point at an article that no longer exists.
    const [comments, stats] = await Promise.all([
      Comment.deleteMany({ article: deleted._id }),
      ViewStat.deleteMany({ article: deleted._id }),
    ]);

    logger.info(
      `Article ${req.params.id} deleted by editor ${req.session.userId} ` +
        `(removed ${comments.deletedCount} comments, ${stats.deletedCount} view-stat records)`,
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
