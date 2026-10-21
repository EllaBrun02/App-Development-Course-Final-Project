const mongoose = require('mongoose');
const { bad } = require('../utils/validation');

const CATEGORIES = ['Technology', 'Politics', 'Sports', 'Science', 'Business', 'Health', 'Entertainment', 'World'];

// A news article: its content, author, workflow status, auto-saved work and edit links.
const articleSchema = new mongoose.Schema({
  // Published / current content
  title: { type: String, default: '', maxlength: 200, required: function () { return this.status !== 'draft'; } },
  content: { type: String, default: '', maxlength: 100000, required: function () { return this.status !== 'draft'; } },
  summary: { type: String, default: '', maxlength: 500, required: function () { return this.status !== 'draft'; } },
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

  // An edit of a published article is a separate article that points to it.
  // When the edit is approved it replaces the original (see publishArticle).
  revisionOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
  // Published articles this one replaced, so their old links still work.
  replaces: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],

  draftKey: { type: String },
  views: { type: Number, default: 0 },
}, { timestamps: true, optimisticConcurrency: true });

articleSchema.index({ author: 1, draftKey: 1 }, { unique: true, partialFilterExpression: { draftKey: { $type: 'string' } } });
articleSchema.index({ title: 'text', summary: 'text' });
articleSchema.index({ status: 1, category: 1, publishedAt: -1 });
// Indexes matching the queries actually used —
// popularity sort on the public feed, and the reporter dashboard listing.
articleSchema.index({ status: 1, views: -1 });
articleSchema.index({ author: 1, updatedAt: -1 });
// At most one edit per published article. The database enforces it, so two
// edits submitted at the same moment cannot both be saved.
articleSchema.index({ revisionOf: 1 }, { unique: true, partialFilterExpression: { revisionOf: { $type: 'objectId' } } });
articleSchema.index({ replaces: 1 });

articleSchema.statics.CATEGORIES = CATEGORIES;
const EDIT_PENDING =
  'This article already has an edit waiting for review. It must be approved, returned or deleted before another edit can be submitted.';
articleSchema.statics.EDIT_PENDING = EDIT_PENDING;

// The edit of a published article that is still in progress, if any. One
// waiting for review blocks editing; one returned for corrections is reopened.
articleSchema.statics.openEdit = async function (original) {
  const edit = await this.findOne({ revisionOf: original._id }).select('status');
  if (edit?.status === 'pending') bad(EDIT_PENDING, 409);
  return edit;
};

// Saves an edit of a published article as a new pending article linked to it.
// The published article itself stays unchanged until the edit is approved.
articleSchema.statics.submitEdit = async function (original, data) {
  if (original.status !== 'published') bad('Only published articles can receive an edit', 409);
  if (await this.openEdit(original))
    bad('This article already has an edit returned for corrections. Continue that edit instead.', 409);
  try {
    return await this.create({
      ...data,
      category: original.category,
      author: original.author,
      status: 'pending',
      revisionOf: original._id,
    });
  } catch (err) {
    // Another edit of the same article was saved at the same moment.
    if (err.code === 11000) bad(EDIT_PENDING, 409);
    throw err;
  }
};

module.exports = mongoose.model('Article', articleSchema);
