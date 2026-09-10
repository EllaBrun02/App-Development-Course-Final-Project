const Article = require('../models/Article');
const logger = require('../utils/logger');

exports.getDashboard = async (req, res) => {
  try {
    const articles = await Article.find({ author: req.session.userId })
      .select('title status category createdAt publishedAt editorNote')
      .sort({ updatedAt: -1 });
    res.render('reporter/dashboard', {
      articles,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Reporter dashboard error: ${err.message}`);
    res.status(500).render('error', { message: 'Server error', code: 500 });
  }
};

exports.getNewArticle = (req, res) => {
  res.render('reporter/article-editor', {
    article: null,
    categories: Article.CATEGORIES,
    user: req.session.userName,
    userRole: req.session.userRole,
  });
};

exports.createArticle = async (req, res) => {
  try {
    const { title, content, summary, image, category } = req.body;
    if (!title || !content || !summary || !category) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    const article = await Article.create({
      title, content, summary, image: image || '', category,
      author: req.session.userId,
      status: 'draft',
    });
    res.status(201).json({ id: article._id });
  } catch (err) {
    logger.error(`Create article error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getEditArticle = async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, author: req.session.userId });
    if (!article) return res.status(404).render('error', { message: 'Article not found', code: 404 });

    res.render('reporter/article-editor', {
      article,
      categories: Article.CATEGORIES,
      user: req.session.userName,
      userRole: req.session.userRole,
    });
  } catch (err) {
    logger.error(`Get edit article error: ${err.message}`);
    res.status(500).render('error', { message: 'Server error', code: 500 });
  }
};

// Auto-save: persists work in progress without changing status
exports.autoSave = async (req, res) => {
  try {
    const { title, content, summary, image, isUpdate } = req.body;
    const article = await Article.findOne({ _id: req.params.id, author: req.session.userId });
    if (!article) return res.status(404).json({ error: 'Not found' });

    const saveData = { title, content, summary, image: image || '', savedAt: new Date() };

    if (isUpdate && article.status === 'published') {
      // Auto-saving an update to a published article
      if (!article.pendingUpdate) article.pendingUpdate = {};
      article.pendingUpdate.autoSave = saveData;
    } else {
      // Auto-saving the main article draft
      article.autoSave = saveData;
    }
    await article.save();
    res.json({ ok: true, savedAt: saveData.savedAt });
  } catch (err) {
    logger.error(`Auto-save error: ${err.message}`);
    res.status(500).json({ error: 'Auto-save failed' });
  }
};

// Submit draft for editor review
exports.submitForReview = async (req, res) => {
  try {
    const { title, content, summary, image } = req.body;
    const article = await Article.findOne({ _id: req.params.id, author: req.session.userId });
    if (!article) return res.status(404).json({ error: 'Not found' });

    if (!['draft', 'returned'].includes(article.status)) {
      return res.status(400).json({ error: 'Article cannot be submitted in its current state.' });
    }

    article.title = title;
    article.content = content;
    article.summary = summary;
    article.image = image || '';
    article.status = 'pending';
    article.editorNote = '';
    article.autoSave = undefined;
    await article.save();

    logger.info(`Article ${article._id} submitted for review by reporter ${req.session.userId}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Submit review error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
};

// Submit an update to an already-published article
exports.submitUpdate = async (req, res) => {
  try {
    const { title, content, summary, image } = req.body;
    const article = await Article.findOne({ _id: req.params.id, author: req.session.userId, status: 'published' });
    if (!article) return res.status(404).json({ error: 'Not found' });

    article.pendingUpdate = {
      title, content, summary, image: image || '',
      status: 'pending',
      editorNote: '',
      submittedAt: new Date(),
      autoSave: undefined,
    };
    await article.save();

    logger.info(`Article ${article._id} update submitted for review`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Submit update error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update article content and stay in draft/returned state
exports.saveArticle = async (req, res) => {
  try {
    const { title, content, summary, image } = req.body;
    const article = await Article.findOne({ _id: req.params.id, author: req.session.userId });
    if (!article) return res.status(404).json({ error: 'Not found' });

    if (!['draft', 'returned'].includes(article.status)) {
      return res.status(400).json({ error: 'Cannot edit article in current state.' });
    }
    article.title = title;
    article.content = content;
    article.summary = summary;
    article.image = image || '';
    await article.save();
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Save article error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
};
