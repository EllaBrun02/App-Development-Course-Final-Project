const Article = require("../models/Article");
const v = require("../utils/validation");
const run = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};
const context = (req) => ({
  user: req.session.userName,
  userId: req.session.userId,
  userRole: req.session.userRole,
  categories: Article.CATEGORIES,
});
async function owned(req) {
  const a = await Article.findOne({
    _id: req.params.id,
    author: req.session.userId,
  });
  if (!a) v.bad("Article not found", 404);
  v.revision(a, req.body);
  return a;
}
function editable(a, isUpdate) {
  if (isUpdate) {
    if (a.status !== "published" || a.pendingUpdate?.status === "pending")
      v.bad("Update cannot be edited in this state", 409);
  } else if (!["draft", "returned"].includes(a.status))
    v.bad("Article cannot be edited in this state", 409);
}
exports.getDashboard = run(async (req, res) => {
  const articles = await Article.find({ author: req.session.userId })
    .select(
      "title status category createdAt publishedAt editorNote pendingUpdate.status pendingUpdate.editorNote",
    )
    .sort({ updatedAt: -1, _id: -1 });
  res.render("reporter/dashboard", { articles, ...context(req) });
});
exports.getNewArticle = (req, res) =>
  res.render("reporter/article-editor", { article: null, ...context(req) });
exports.getEditArticle = run(async (req, res) => {
  const article = await Article.findOne({
    _id: req.params.id,
    author: req.session.userId,
  });
  if (!article) v.bad("Article not found", 404);
  res.render("reporter/article-editor", { article, ...context(req) });
});
exports.createArticle = run(async (req, res) => {
  const data = v.content(req.body);
  const category = req.body.category || Article.CATEGORIES[0];
  if (!Article.CATEGORIES.includes(category)) v.bad("Invalid category");
  const draftKey = req.body.draftKey;
  if (
    draftKey !== undefined &&
    !/^[a-zA-Z0-9-]{10,80}$/.test(v.text(draftKey, "draft key", 80))
  )
    v.bad("Invalid draft key");
  let a;
  // Same creation retried after a lost response must return the original draft.
  if (draftKey)
    a = await Article.findOne({ author: req.session.userId, draftKey });
  if (!a) {
    try {
      a = await Article.create({
        ...data,
        category,
        author: req.session.userId,
        status: "draft",
        ...(draftKey ? { draftKey } : {}),
      });
    } catch (e) {
      if (e.code !== 11000 || !draftKey) throw e;
      a = await Article.findOne({ author: req.session.userId, draftKey });
    }
  }
  res.status(201).json({ id: a._id, revision: a.__v });
});
exports.autoSave = run(async (req, res) => {
  const a = await owned(req),
    isUpdate = v.boolean(req.body.isUpdate, "isUpdate");
  editable(a, isUpdate);
  const data = { ...v.content(req.body), savedAt: new Date() };
  if (isUpdate) a.pendingUpdate.autoSave = data;
  else a.autoSave = data;
  await a.save();
  res.json({ ok: true, savedAt: data.savedAt, revision: a.__v });
});
exports.saveArticle = run(async (req, res) => {
  const a = await owned(req);
  editable(a, false);
  Object.assign(a, v.content(req.body, a.status === "returned"));
  a.autoSave = undefined;
  await a.save();
  res.json({ ok: true, revision: a.__v });
});
exports.submitForReview = run(async (req, res) => {
  const a = await owned(req);
  editable(a, false);
  Object.assign(a, v.content(req.body, true));
  a.status = "pending";
  a.editorNote = "";
  a.autoSave = undefined;
  await a.save();
  res.json({ ok: true, revision: a.__v });
});
exports.submitUpdate = run(async (req, res) => {
  const a = await owned(req);
  editable(a, true);
  a.pendingUpdate = {
    ...v.content(req.body, true),
    status: "pending",
    editorNote: "",
    submittedAt: new Date(),
  };
  await a.save();
  res.json({ ok: true, revision: a.__v });
});
