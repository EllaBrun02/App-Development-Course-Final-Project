// Throws an error with an HTTP status; errorResponse sends it to the client.
function bad(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
// Checks that a field is a string no longer than max (and not blank when required).
function text(value, name, max, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    bad(`Invalid ${name}`);
  return value;
}
// Validates the article fields from a request body and returns only those fields;
// the image, when given, must be an http(s) URL.
function content(body, required = false) {
  const data = {};
  for (const [key, max] of Object.entries({
    title: 200,
    summary: 500,
    content: 100000,
    image: 2048,
  })) {
    data[key] = text(body[key], key, max, required && key !== 'image');
  }
  if (data.image) {
    let url;
    try {
      url = new URL(data.image);
    } catch {
      bad('Invalid image URL');
    }
    if (!['http:', 'https:'].includes(url.protocol)) bad('Image must use HTTP or HTTPS');
  }
  return data;
}
// Rejects anything that is not a 24-character MongoDB id before it reaches a query.
function objectId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) bad('Invalid identifier');
  return value;
}
// Parses a page number from the query string (a positive whole number).
function page(value = '1') {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > 100000)
    bad('Invalid page');
  return Number(value);
}
// Escapes regex special characters so user search text is matched literally.
function literal(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Accepts only true/false (or a missing value, treated as false).
function boolean(value, name) {
  if (value !== undefined && typeof value !== 'boolean') bad(`Invalid ${name}`);
  return value === true;
}
// Rejects a save made from an older copy of the article, so one user cannot
// silently overwrite another user's changes.
function revision(article, body) {
  if (
    body.revision !== undefined &&
    (!Number.isInteger(body.revision) || body.revision !== article.__v)
  )
    bad('This article changed elsewhere. Reload before saving.', 409);
}
// Picks the HTTP status for an error and answers with JSON (API, fetch and
// non-GET requests) or with the error page for normal page loads.
function errorResponse(err, req, res) {
  const status =
    err.status ||
    (err.name === 'VersionError'
      ? 409
      : err.code === 11000
        ? 409
        : ['ValidationError', 'CastError'].includes(err.name) ||
            err.type === 'entity.parse.failed' ||
            err instanceof URIError
          ? 400
          : 500);
  // Messages written by the app (bad) are shown as they are; database
  // conflicts (stale version, duplicate key) get a generic message.
  const message =
    status === 500
      ? 'Server error'
      : status === 409 && !err.status
        ? 'Conflict: reload the current record before retrying.'
        : err.message;
  if (
    req.method !== 'GET' ||
    req.path?.includes('/api/') ||
    req.headers.accept?.includes('application/json')
  )
    return res.status(status).json({ error: message });
  return res.status(status).render('error', { message, code: status });
}
module.exports = {
  bad,
  text,
  content,
  objectId,
  page,
  literal,
  boolean,
  revision,
  errorResponse,
};
