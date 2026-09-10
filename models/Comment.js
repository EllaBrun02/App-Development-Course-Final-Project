const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true, index: true },
  author: { type: String, required: true, trim: true, maxlength: 50 },
  body: { type: String, required: true, trim: true, maxlength: 1000 },
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);
