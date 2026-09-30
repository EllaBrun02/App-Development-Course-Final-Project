const Article = require('../models/Article');
const ViewStat = require('../models/ViewStat');
const logger = require('../utils/logger');

exports.getDashboard = async (req, res) => {
  try {
    const { status, category } = req.query;
    const query = {};
    if (status) query.status = status;
    if (category && Article.CATEGORIES.includes(category)) query.category = category;

    // Also fetch articles with pending updates
    const articles = await Article.find(query)
      .select('title status category author publishedAt createdAt pendingUpdate')
      .populate('author', 'name')
      .sort({ updatedAt: -1 });

    res.render('editor/dashboard', {
      articles,
      categories: Article.CATEGORIES,
      filterStatus: status || '',
      filterCategory: category || '',
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

exports.getEditArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('author', 'name');
    if (!article) return res.status(404).render('error', { message: 'Not found', code: 404 });
    res.render('editor/article-edit', {
      article,
      categories: Article.CATEGORIES,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Editor get edit error: ${err.message}`);
    res.status(500).render('error', { message: 'Server error', code: 500 });
  }
};

// Editor edits article content directly
exports.editArticle = async (req, res) => {
  try {
    const { title, content, summary, image, category } = req.body;
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Not found' });
    if (!title || !content || !summary) return res.status(400).json({ error: 'Title, summary and content are required.' });
    article.title = title;
    article.content = content;
    article.summary = summary;
    article.image = image || '';
    if (category && Article.CATEGORIES.includes(category)) article.category = category;
    await article.save();
    logger.info(`Article ${article._id} edited by editor ${req.session.userId}`);
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
    await Article.findByIdAndDelete(req.params.id);
    logger.info(`Article ${req.params.id} deleted by editor ${req.session.userId}`);
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
    const stats = await ViewStat.find({ article: req.params.id }).sort({ hour: 1 });
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
