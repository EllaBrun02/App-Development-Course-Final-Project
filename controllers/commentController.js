const Comment = require('../models/Comment');
const Article = require('../models/Article');
const logger = require('../utils/logger');

exports.addComment = async (req, res) => {
  try {
    const { author, body } = req.body;
    const { id } = req.params;
    const v = require('../utils/validation');
    v.text(author, 'name', 50, true);
    v.text(body, 'comment', 1000, true);

    if (!author || !body) {
      return res.status(400).json({ error: 'Name and comment are required.' });
    }
    if (author.trim().length > 50) {
      return res.status(400).json({ error: 'Name too long (max 50 chars).' });
    }
    if (body.trim().length > 1000) {
      return res.status(400).json({ error: 'Comment too long (max 1000 chars).' });
    }

    const article = await Article.findOne({ _id: id, status: 'published' });
    if (!article) return res.status(404).json({ error: 'Article not found.' });

    const comment = await Comment.create({
      article: id,
      author: author.trim(),
      body: body.trim(),
    });

    logger.info(`Comment added to article ${id} by "${author.trim()}"`);
    res.status(201).json({ comment });
  } catch (err) {
    logger.error(`Comment error: ${err.message}`);
    require('../utils/validation').errorResponse(err, req, res);
  }
};
