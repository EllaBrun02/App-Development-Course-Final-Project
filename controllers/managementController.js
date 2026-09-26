const User = require("../models/User"),
  Article = require("../models/Article"),
  Comment = require("../models/Comment"),
  ViewStat = require("../models/ViewStat");
const v = require("../utils/validation");
const models = { users: User, comments: Comment, viewstats: ViewStat };
const run = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    v.errorResponse(err, req, res);
  }
};
function model(req) {
  const m = Object.hasOwn(models, req.params.resource) ? models[req.params.resource] : null;
  if (!m) v.bad("Unknown resource", 404);
  return m;
}
function clean(item) {
  const obj = item.toObject();
  delete obj.passwordHash;
  return obj;
}
async function fields(req, existing) {
  const body = req.body,
    out = {},
    kind = req.params.resource,
    creating = !existing;
  if (kind === "users") {
    for (const [key, max] of [
      ["username", 80],
      ["name", 100],
      ["role", 20],
    ])
      if (creating || body[key] !== undefined)
        out[key] = v.text(body[key], key, max, true).trim();
    if (out.role && !["editor", "reporter"].includes(out.role))
      v.bad("Invalid role");
    if (body.password !== undefined || creating) {
      const password = v.text(body.password, "password", 100, true);
      if (password.length < 8 || Buffer.byteLength(password) > 72)
        v.bad(
          "Password must contain at least 8 characters and at most 72 UTF-8 bytes",
        );
      out.passwordHash = await User.hashPassword(password);
    }
    if (
      existing &&
      String(existing._id) === req.session.userId &&
      out.role &&
      out.role !== "editor"
    )
      v.bad("You cannot remove your own editor access", 409);
    if (
      existing &&
      out.role === "reporter" &&
      existing.role === "editor" &&
      (await User.countDocuments({ role: "editor" })) <= 1
    )
      v.bad("Keep at least one editor", 409);
  } else {
    if (creating || body.article !== undefined) {
      out.article = v.objectId(body.article);
      if (!(await Article.exists({ _id: out.article })))
        v.bad("Article not found", 404);
    }
    if (kind === "comments") {
      for (const [key, max] of [
        ["author", 50],
        ["body", 1000],
      ])
        if (creating || body[key] !== undefined)
          out[key] = v.text(body[key], key, max, true).trim();
    } else {
      if (creating || body.hour !== undefined) {
        const raw = v.text(body.hour, "hour", 40, true),
          date = new Date(raw);
        if (!Number.isFinite(date.getTime()) || date > new Date())
          v.bad("Invalid hour");
        date.setMinutes(0, 0, 0);
        out.hour = date;
      }
      if (creating || body.count !== undefined) {
        if (!Number.isSafeInteger(body.count) || body.count < 0)
          v.bad("Count must be a nonnegative integer");
        out.count = body.count;
      }
      if (body.publishEvents !== undefined) {
        if (
          !Array.isArray(body.publishEvents) ||
          body.publishEvents.length > 100
        )
          v.bad("Invalid publish events");
        out.publishEvents = body.publishEvents.map((x) => {
          const d = new Date(v.text(x, "event time", 40, true));
          if (!Number.isFinite(d.getTime()) || d > new Date())
            v.bad("Invalid event time");
          return d;
        });
      }
    }
  }
  return out;
}
async function synchronize(ids) {
  for (const id of new Set(ids.filter(Boolean).map(String))) {
    const stats = await ViewStat.aggregate([
      { $match: { article: new (require("mongoose").Types.ObjectId)(id) } },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ]);
    await Article.updateOne(
      { _id: id },
      { $set: { views: stats[0]?.total || 0 } },
    );
  }
}
exports.getPage = (req, res) =>
  res.render("editor/manage", {
    user: req.session.userName,
    userRole: req.session.userRole,
  });
exports.list = run(async (req, res) => {
  const m = model(req),
    query = {},
    page = v.page(req.query.page);
  if (req.query.search) {
    const search = v.literal(v.text(req.query.search, "search", 200));
    if (req.params.resource === "users")
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    else if (req.params.resource === "comments")
      query.$or = [
        { author: { $regex: search, $options: "i" } },
        { body: { $regex: search, $options: "i" } },
      ];
    else query.article = v.objectId(req.query.search);
  }
  if (req.query.article && req.params.resource !== "users")
    query.article = v.objectId(req.query.article);
  const items = await m
    .find(query)
    .select("-passwordHash")
    .sort({ _id: -1 })
    .skip((page - 1) * 20)
    .limit(21);
  res.json({
    items: items.slice(0, 20).map(clean),
    hasMore: items.length > 20,
  });
});
exports.read = run(async (req, res) => {
  const item = await model(req).findById(req.params.id).select("-passwordHash");
  if (!item) v.bad("Not found", 404);
  res.json({ item: clean(item) });
});
exports.create = run(async (req, res) => {
  const item = await model(req).create(await fields(req));
  if (req.params.resource === "viewstats") await synchronize([item.article]);
  res.status(201).json({ item: clean(item) });
});
exports.update = run(async (req, res) => {
  const item = await model(req).findById(req.params.id);
  if (!item) v.bad("Not found", 404);
  const old = item.article;
  Object.assign(item, await fields(req, item));
  await item.save();
  if (req.params.resource === "viewstats")
    await synchronize([old, item.article]);
  res.json({ item: clean(item) });
});
exports.remove = run(async (req, res) => {
  const item = await model(req).findById(req.params.id);
  if (!item) v.bad("Not found", 404);
  if (req.params.resource === "users") {
    if (String(item._id) === req.session.userId)
      v.bad("You cannot delete your own account", 409);
    if (await Article.exists({ author: item._id }))
      v.bad("This user still owns articles", 409);
    if (
      item.role === "editor" &&
      (await User.countDocuments({ role: "editor" })) <= 1
    )
      v.bad("Keep at least one editor", 409);
  }
  await item.deleteOne();
  if (req.params.resource === "viewstats") await synchronize([item.article]);
  res.json({ ok: true });
});
