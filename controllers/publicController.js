const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const { getWeather } = require('../utils/weather');
const logger = require('../utils/logger');

const PAGE_SIZE = 20;
const v = require('../utils/validation');

exports.getHome = async (req, res) => {
  try {
    const weather = await getWeather();
    res.render('index', {
      weather,
      categories: Article.CATEGORIES,
      user: req.session.userName || null,
      userRole: req.session.userRole || null,
    });
  } catch (err) {
    logger.error(`Home page error: ${err.message}`);
    require('../utils/validation').errorResponse(err, req, res);
  }
};

// API: paginated published articles with search/filter/sort
exports.getArticles = async (req, res) => {
  try {
    const { page = '1', search, category, sort = 'date', viewed } = req.query;
    const query = { status: 'published' };
    const pageNumber = v.page(page);
    if (search !== undefined) v.text(search, 'search', 200);
    if (category && !Article.CATEGORIES.includes(category)) v.bad('Invalid category');
    if (!['date','popularity'].includes(sort)) v.bad('Invalid sort');
    if (viewed && !['viewed','unviewed'].includes(viewed)) v.bad('Invalid viewed filter');

    if (search) {
      query.$or = [
        { title: { $regex: v.literal(search), $options: 'i' } },
        { summary: { $regex: v.literal(search), $options: 'i' } },
      ];
    }
    if (category && Article.CATEGORIES.includes(category)) {
      query.category = category;
    }

    // Reading history belongs to the current visitor, not all site readers.
    const viewedIds = req.session.viewedArticles || [];
    if (viewed === 'viewed') {
      query._id = { $in: viewedIds };
    } else if (viewed === 'unviewed') {
      query._id = { $nin: viewedIds };
    }

    const sortOption = sort === 'popularity' ? { views: -1, _id: -1 } : { publishedAt: -1, _id: -1 };

    const skip = (pageNumber - 1) * PAGE_SIZE;
    const articles = await Article.find(query)
      .select('title summary image category author publishedAt views')
      .populate('author', 'name')
      .sort(sortOption)
      .skip(skip)
      .limit(PAGE_SIZE + 1); // fetch one extra to know if there's a next page

    const hasMore = articles.length > PAGE_SIZE;
    if (hasMore) articles.pop();

    res.json({ articles, hasMore });
  } catch (err) {
    logger.error(`Articles API error: ${err.message}`);
    require('../utils/validation').errorResponse(err, req, res);
  }
};

exports.getArticlePage = async (req, res) => {
  try {
    const article = await Article.findOne({ _id: req.params.id, status: 'published' })
      .populate('author', 'name');
    if (!article) return res.status(404).render('error', { message: 'Article not found', code: 404 });

    // Record view (audit #29: keep the article counter and the per-hour
    // stats consistent — compensate if only one of the two writes succeeds)
    const recorded = await recordView(article._id);
    if (recorded) article.views += 1;

    // Track in session for viewed/unviewed filter
    if (!req.session.viewedArticles) req.session.viewedArticles = [];
    const idStr = article._id.toString();
    if (!req.session.viewedArticles.includes(idStr)) {
      req.session.viewedArticles.push(idStr);
    }

    const comments = await Comment.find({ article: article._id }).sort({ createdAt: 1 });
    const weather = await getWeather();

    res.render('article', {
      article,
      comments,
      weather,
      categories: Article.CATEGORIES,
      user: req.session.userName || null,
      userRole: req.session.userRole || null,
    });
  } catch (err) {
    logger.error(`Article page error: ${err.message}`);
    require('../utils/validation').errorResponse(err, req, res);
  }
};

// Audit #29: the two related writes (hourly bucket + total counter) are not
// atomic in MongoDB without transactions. We order them and compensate: the
// bucket is incremented first; if the total-counter update then fails, the
// bucket increment is rolled back so the two numbers stay consistent.
async function recordView(articleId) {
  const now = new Date();
  const hour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  try {
    await ViewStat.findOneAndUpdate(
      { article: articleId, hour },
      { $inc: { count: 1 } },
      { upsert: true }
    );
  } catch (err) {
    logger.error(`ViewStat update error: ${err.message}`);
    return false; // stats not recorded — don't bump the total counter either
  }
  try {
    await Article.updateOne({ _id: articleId }, { $inc: { views: 1 } });
    return true;
  } catch (err) {
    logger.error(`Article views counter update error: ${err.message} — rolling back stat increment`);
    try {
      await ViewStat.updateOne({ article: articleId, hour }, { $inc: { count: -1 } });
    } catch (rollbackErr) {
      logger.error(`ViewStat rollback failed (data may be inconsistent): ${rollbackErr.message}`);
    }
    return false;
  }
}

// API endpoint so an open page can refresh the weather widget (audit #26)
exports.getWeatherData = async (req, res) => {
  try {
    const weather = await getWeather();
    res.json({ weather });
  } catch (err) {
    logger.error(`Weather API error: ${err.message}`);
    res.status(500).json({ error: 'Weather unavailable' });
  }
};
