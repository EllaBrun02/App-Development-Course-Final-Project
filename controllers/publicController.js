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

    // Record view
    await recordView(article._id);
    article.views += 1;
    await Article.updateOne({ _id: article._id }, { $inc: { views: 1 } });

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
  }
}
