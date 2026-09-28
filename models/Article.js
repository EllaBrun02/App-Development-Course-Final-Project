const mongoose = require('mongoose');

const CATEGORIES = ['Technology', 'Politics', 'Sports', 'Science', 'Business', 'Health', 'Entertainment', 'World'];

// Sub-schema for content (reused for main and pending update)
const contentSchema = {
  title: String,
  content: String,
  summary: String,
  image: String,
};

const articleSchema = new mongoose.Schema({
  // Published / current content
  title: { type: String, required: true },
  content: { type: String, required: true },
  summary: { type: String, required: true },
  image: { type: String, default: '' },
  category: { type: String, enum: CATEGORIES, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Workflow status of the main article
  status: {
    type: String,
    enum: ['draft', 'pending', 'published', 'returned'],
    default: 'draft',
  },
  editorNote: { type: String, default: '' },
  publishedAt: { type: Date },

  // Auto-save: in-progress work reporter hasn't submitted yet
  autoSave: {
    title: String,
    content: String,
    summary: String,
    image: String,
    savedAt: Date,
  },

  // Pending update to an already-published article
  pendingUpdate: {
    title: String,
    content: String,
    summary: String,
    image: String,
    status: { type: String, enum: ['pending', 'returned', null], default: null },
    editorNote: { type: String, default: '' },
    submittedAt: Date,
    // Auto-save draft of the update while reporter is writing it
    autoSave: {
      title: String,
      content: String,
      summary: String,
      image: String,
      savedAt: Date,
    },
  },

  views: { type: Number, default: 0 },
}, { timestamps: true });

articleSchema.index({ title: 'text', summary: 'text' });
articleSchema.index({ status: 1, category: 1, publishedAt: -1 });
// Audit #28: indexes matching the queries actually used —
// popularity sort on the public feed, and the reporter dashboard listing.
articleSchema.index({ status: 1, views: -1 });
articleSchema.index({ author: 1, updatedAt: -1 });

articleSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('Article', articleSchema);
