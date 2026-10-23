const Article = require('../models/Article');
const v = require('../utils/validation');
// Wraps an async handler so any thrown error becomes an error response.
const run = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};
// Session details and categories that every reporter page needs.
const context = (req) => ({
  user: req.session.userName,
  userId: req.session.userId,
  userRole: req.session.userRole,
  categories: Article.CATEGORIES,
});
// Loads one of the logged-in reporter's own articles (404 otherwise) and rejects
// the request if the article changed since the browser loaded it.
async function owned(req) {
  const a = await Article.findOne({
    _id: req.params.id,
    author: req.session.userId,
  });
  if (!a) v.bad('Article not found', 404);
  v.revision(a, req.body);
  return a;
}
// Reporters can change only drafts and articles returned for corrections.
function editable(a) {
  if (!['draft', 'returned'].includes(a.status))
    v.bad('Article cannot be edited in this state', 409);
}
// Renders the reporter dashboard with only the logged-in reporter's articles,
// most recently changed first.
exports.getDashboard = run(async (req, res) => {
  const articles = await Article.find({ author: req.session.userId })
    .select('title status category createdAt publishedAt editorNote revisionOf')
    .sort({ updatedAt: -1, _id: -1 });
  // Edits of published articles have the same author, so they are in this list too.
  const byId = new Map(articles.map((a) => [String(a._id), a]));
  const edits = new Map(articles.filter((a) => a.revisionOf).map((a) => [String(a.revisionOf), a]));
  res.render('reporter/dashboard', { articles, byId, edits, editPending: Article.EDIT_PENDING, ...context(req) });
});
// Opens an empty editor for a new article.
exports.getNewArticle = (req, res) =>
  res.render('reporter/article-editor', { article: null, ...context(req) });
// Opens the editor for one of the reporter's own articles. For a published article
// that already has an open edit, it redirects to that edit.
exports.getEditArticle = run(async (req, res) => {
  const article = await Article.findOne({
    _id: req.params.id,
    author: req.session.userId,
  });
  if (!article) v.bad('Article not found', 404);
  if (article.status === 'published') {
    // A published article has at most one edit; continue it instead of starting another.
    const edit = await Article.openEdit(article);
    if (edit) return res.redirect(`/reporter/articles/${edit._id}/edit`);
  }
  res.render('reporter/article-editor', { article, ...context(req) });
});
// Creates a new draft owned by the reporter and returns its ID. The optional draftKey
// makes a retried request return the same draft instead of creating a second one.
exports.createArticle = run(async (req, res) => {
  const data = v.content(req.body);
  const category = req.body.category || Article.CATEGORIES[0];
  if (!Article.CATEGORIES.includes(category)) v.bad('Invalid category');
  const draftKey = req.body.draftKey;
  if (draftKey !== undefined && !/^[a-zA-Z0-9-]{10,80}$/.test(v.text(draftKey, 'draft key', 80)))
    v.bad('Invalid draft key');
  let a;
  // Same creation retried after a lost response must return the original draft.
  if (draftKey) a = await Article.findOne({ author: req.session.userId, draftKey });
  if (!a) {
    try {
      a = await Article.create({
        ...data,
        category,
        author: req.session.userId,
        status: 'draft',
        ...(draftKey ? { draftKey } : {}),
      });
    } catch (e) {
      if (e.code !== 11000 || !draftKey) throw e;
      a = await Article.findOne({ author: req.session.userId, draftKey });
    }
  }
  res.status(201).json({ id: a._id, revision: a.__v });
});
// Stores in-progress text in autoSave without changing the saved content.
// Only for the reporter's own drafts and returned articles.
exports.autoSave = run(async (req, res) => {
  const a = await owned(req);
  editable(a);
  const data = { ...v.content(req.body), savedAt: new Date() };
  a.autoSave = data;
  await a.save();
  res.json({ ok: true, savedAt: data.savedAt, revision: a.__v });
});
// Saves the reporter's own draft or returned article and clears the auto-save copy.
// A returned article must keep all required fields filled.
exports.saveArticle = run(async (req, res) => {
  const a = await owned(req);
  editable(a);
  Object.assign(a, v.content(req.body, a.status === 'returned'));
  a.autoSave = undefined;
  await a.save();
  res.json({ ok: true, revision: a.__v });
});
// Sends the reporter's own draft or returned article for review: all fields are
// required, the status becomes pending and the old editor note is cleared.
exports.submitForReview = run(async (req, res) => {
  const a = await owned(req);
  editable(a);
  Object.assign(a, v.content(req.body, true));
  a.status = 'pending';
  a.editorNote = '';
  a.autoSave = undefined;
  await a.save();
  res.json({ ok: true, revision: a.__v });
});
// Editing a published article creates a new pending article linked to it.
exports.submitUpdate = run(async (req, res) => {
  const original = await owned(req);
  const edit = await Article.submitEdit(original, v.content(req.body, true));
  res.json({ ok: true, id: edit._id });
});
