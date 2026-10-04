const mongoose = require('mongoose');
const User = require('../models/User');
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const ViewStat = require('../models/ViewStat');
const v = require('../utils/validation');

// Editor-only CRUD for the models that have no workflow screen of their own.
// Articles are created by reporters and managed through the editor workflow.
const MODELS = { users: User, comments: Comment, viewstats: ViewStat };
const PAGE_SIZE = 20;
const HOUR_MS = 60 * 60 * 1000;

// Wraps an async handler so any validation error becomes a JSON error response.
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};

function getModel(req) {
  const model = Object.hasOwn(MODELS, req.params.resource) ? MODELS[req.params.resource] : null;
  if (!model) v.bad('Unknown resource', 404);
  return model;
}

// Never send password hashes to the browser.
function toJson(item) {
  const obj = item.toObject();
  delete obj.passwordHash;
  return obj;
}

function parsePastDate(value, name) {
  const date = new Date(v.text(value, name, 40, true));
  if (!Number.isFinite(date.getTime()) || date > new Date()) v.bad(`Invalid ${name}`);
  return date;
}

// The read*Fields functions validate the request body and return only the
// allowed fields. When updating, fields that were not sent stay unchanged.
async function readUserFields(body, existing, currentUserId) {
  const creating = !existing;
  const fields = {};
  for (const [key, max] of [['username', 80], ['name', 100], ['role', 20]]) {
    if (creating || body[key] !== undefined) fields[key] = v.text(body[key], key, max, true).trim();
  }
  if (fields.role && !['editor', 'reporter'].includes(fields.role)) v.bad('Invalid role');

  if (creating || body.password !== undefined) {
    const password = v.text(body.password, 'password', 100, true);
    // bcrypt only uses the first 72 bytes of a password
    if (password.length < 8 || Buffer.byteLength(password) > 72)
      v.bad('Password must contain at least 8 characters and at most 72 UTF-8 bytes');
    fields.passwordHash = await User.hashPassword(password);
  }

  if (existing && fields.role && fields.role !== 'editor') {
    if (String(existing._id) === currentUserId) v.bad('You cannot remove your own editor access', 409);
    if (existing.role === 'editor' && (await User.countDocuments({ role: 'editor' })) <= 1)
      v.bad('Keep at least one editor', 409);
  }
  return fields;
}

function readCommentFields(body, creating) {
  const fields = {};
  for (const [key, max] of [['author', 50], ['body', 1000]]) {
    if (creating || body[key] !== undefined) fields[key] = v.text(body[key], key, max, true).trim();
  }
  return fields;
}

function readViewStatFields(body, existing) {
  const creating = !existing;
  const fields = {};
  if (creating || body.hour !== undefined) {
    const hour = parsePastDate(body.hour, 'hour');
    hour.setUTCMinutes(0, 0, 0); // each record covers one whole hour
    fields.hour = hour;
  }
  if (creating || body.count !== undefined) {
    if (!Number.isSafeInteger(body.count) || body.count < 0) v.bad('Count must be a nonnegative integer');
    fields.count = body.count;
  }
  if (body.publishEvents !== undefined) {
    if (!Array.isArray(body.publishEvents) || body.publishEvents.length > 100) v.bad('Invalid publish events');
    fields.publishEvents = body.publishEvents.map((event) => parsePastDate(event, 'event time'));
  }

  // Publication events must fall inside the record's hour.
  const hour = fields.hour || existing?.hour;
  const events = fields.publishEvents || existing?.publishEvents || [];
  if (events.some((event) => event < hour || event.getTime() >= hour.getTime() + HOUR_MS))
    v.bad("Each publication event must belong to this record's hour");
  return fields;
}

async function readFields(req, existing) {
  const { body } = req;
  const kind = req.params.resource;
  if (kind === 'users') return readUserFields(body, existing, req.session.userId);

  const fields = {};
  if (!existing || body.article !== undefined) {
    fields.article = v.objectId(body.article);
    if (!(await Article.exists({ _id: fields.article }))) v.bad('Article not found', 404);
  }
  const specific = kind === 'comments' ? readCommentFields(body, !existing) : readViewStatFields(body, existing);
  return { ...fields, ...specific };
}

// After view records change, recalculate each affected article's total views
// so Article.views always equals the sum of its hourly records.
async function syncArticleViews(articleIds) {
  for (const id of new Set(articleIds.filter(Boolean).map(String))) {
    const [result] = await ViewStat.aggregate([
      { $match: { article: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]);
    await Article.updateOne({ _id: id }, { $set: { views: result?.total || 0 } });
  }
}

exports.getPage = (req, res) =>
  res.render('editor/manage', {
    user: req.session.userName,
    userRole: req.session.userRole,
  });

exports.list = handle(async (req, res) => {
  const model = getModel(req);
  const kind = req.params.resource;
  const page = v.page(req.query.page);
  const query = {};

  if (req.query.search) {
    const search = v.literal(v.text(req.query.search, 'search', 200));
    const matches = (field) => ({ [field]: { $regex: search, $options: 'i' } });
    if (kind === 'users') query.$or = [matches('username'), matches('name')];
    else if (kind === 'comments') query.$or = [matches('author'), matches('body')];
    else query.article = v.objectId(req.query.search); // view records are searched by article ID
  }
  if (req.query.article && kind !== 'users') query.article = v.objectId(req.query.article);

  // Fetch one extra record to know whether there is a next page.
  const items = await model
    .find(query)
    .select('-passwordHash')
    .sort({ _id: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE + 1);
  res.json({
    items: items.slice(0, PAGE_SIZE).map(toJson),
    hasMore: items.length > PAGE_SIZE,
  });
});

exports.read = handle(async (req, res) => {
  const item = await getModel(req).findById(req.params.id).select('-passwordHash');
  if (!item) v.bad('Not found', 404);
  res.json({ item: toJson(item) });
});

exports.create = handle(async (req, res) => {
  const item = await getModel(req).create(await readFields(req));
  if (req.params.resource === 'viewstats') await syncArticleViews([item.article]);
  res.status(201).json({ item: toJson(item) });
});

exports.update = handle(async (req, res) => {
  const item = await getModel(req).findById(req.params.id);
  if (!item) v.bad('Not found', 404);
  const previousArticle = item.article;
  Object.assign(item, await readFields(req, item));
  await item.save();
  if (req.params.resource === 'viewstats') await syncArticleViews([previousArticle, item.article]);
  res.json({ item: toJson(item) });
});

exports.remove = handle(async (req, res) => {
  const item = await getModel(req).findById(req.params.id);
  if (!item) v.bad('Not found', 404);
  if (req.params.resource === 'users') {
    if (String(item._id) === req.session.userId) v.bad('You cannot delete your own account', 409);
    if (await Article.exists({ author: item._id })) v.bad('This user still owns articles', 409);
    if (item.role === 'editor' && (await User.countDocuments({ role: 'editor' })) <= 1)
      v.bad('Keep at least one editor', 409);
  }
  await item.deleteOne();
  if (req.params.resource === 'viewstats') await syncArticleViews([item.article]);
  res.json({ ok: true });
});
