const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const Comment = require('../models/Comment');
const logger = require('../utils/logger');

const DASHBOARD_PAGE_SIZE = 50;

exports.getDashboard = async (req, res) => {
  try {
    const { status, category } = req.query;
    const query = {};
    if (status) query.status = status;
    if (category && Article.CATEGORIES.includes(category)) query.category = category;

    // Audit #28: paginate instead of loading every article at once,
    // so the dashboard stays fast with thousands of articles.
    let page = parseInt(req.query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;

    const totalCount = await Article.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalCount / DASHBOARD_PAGE_SIZE));
    if (page > totalPages) page = totalPages;

    const articles = await Article.find(query)
      .select('title status category author publishedAt createdAt pendingUpdate.status')
      .populate('author', 'name')
      .sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * DASHBOARD_PAGE_SIZE)
      .limit(DASHBOARD_PAGE_SIZE);

    res.render('editor/dashboard', {
      articles,
      categories: Article.CATEGORIES,
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
    res.status(500).render('error', { message: 'Server error', code: 500 });
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
    res.status(500).render('error', { message: 'Server error', code: 500 });
  }
};

// Editor edits article content directly
exports.editArticle = async (req, res) => {
  try {
    const { title, content, summary, image } = req.body;
    if (!title || !title.trim() || !content || !content.trim() || !summary || !summary.trim()) {
      return res.status(400).json({ error: 'Title, content and summary are required.' });
    }
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    article.title = title;
    article.content = content;
    article.summary = summary;
    article.image = image || '';
    await article.save();

    // Audit #23: a direct editor edit of the live version changes public
    // content, so it must show up on the analytics graph like any update.
    if (article.status === 'published') {
      await recordPublishEvent(article._id, new Date());
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error(`Editor edit error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
};

// Approve main article (publish it)
exports.publishArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    if (article.status !== 'pending') return res.status(400).json({ error: 'Article is not pending.' });

    const publishedAt = new Date();
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
    res.status(500).json({ error: 'Server error' });
  }
};

// Approve pending update to published article
exports.approveUpdate = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article || article.status !== 'published') return res.status(404).json({ error: 'Not found' });
    if (!article.pendingUpdate || article.pendingUpdate.status !== 'pending') {
      return res.status(400).json({ error: 'No pending update.' });
    }

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
    res.status(500).json({ error: 'Server error' });
  }
};

// Return article to reporter with a note
exports.returnArticle = async (req, res) => {
  try {
    const { note, isUpdate } = req.body;
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });

    if (isUpdate) {
      if (!article.pendingUpdate) return res.status(400).json({ error: 'No pending update.' });
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
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete article
exports.deleteArticle = async (req, res) => {
  try {
    const article = await Article.findByIdAndDelete(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });

    // Audit #20: also remove related data so no orphaned records
    // (comments, view stats) point at an article that no longer exists.
    const [comments, stats] = await Promise.all([
      Comment.deleteMany({ article: article._id }),
      ViewStat.deleteMany({ article: article._id }),
    ]);

    logger.info(`Article ${req.params.id} deleted by editor ${req.session.userId} ` +
      `(removed ${comments.deletedCount} comments, ${stats.deletedCount} view-stat records)`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Delete error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
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
    res.status(500).render('error', { message: 'Server error', code: 500 });
  }
};

// Analytics API: return time-series data
exports.getAnalyticsData = async (req, res) => {
  try {
    // Audit #28: filter the requested time range on the server instead of
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
    res.status(500).json({ error: 'Server error' });
  }
};

async function recordPublishEvent(articleId, time) {
  const hour = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours());
  try {
    await ViewStat.findOneAndUpdate(
      { article: articleId, hour },
      { $push: { publishEvents: time } },
      { upsert: true }
    );
  } catch (err) {
    logger.error(`Publish event record error: ${err.message}`);
  }
}
