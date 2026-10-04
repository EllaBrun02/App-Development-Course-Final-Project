const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Session/signing secret:
// 1. Prefer SESSION_SECRET from the environment.
// 2. Otherwise generate a random secret once and persist it locally
//    (config/session-secret.key, gitignored) so sessions survive restarts
//    without shipping a known default secret in the repository.
const SECRET_FILE = path.join(__dirname, '..', 'config', 'session-secret.key');

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    const existing = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (existing) return existing;
  } catch (e) { /* file missing — generate below */ }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  return secret;
}

module.exports = { getSecret };
