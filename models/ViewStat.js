const mongoose = require('mongoose');

// Each document represents one hour-bucket of views for an article.
// This keeps the collection size manageable even with thousands of concurrent users.
const viewStatSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  // The start of the hour this bucket covers (seconds truncated to the hour)
  hour: { type: Date, required: true },
  count: { type: Number, default: 0 },
  // Record each publish/update event on this article so we can mark them on the graph
  publishEvents: [{ type: Date }],
}, { timestamps: false });

viewStatSchema.index({ article: 1, hour: 1 }, { unique: true });

module.exports = mongoose.model('ViewStat', viewStatSchema);
