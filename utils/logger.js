const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'app.log');

function timestamp() {
  return new Date().toISOString();
}

function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFile(logFile, line, () => {});
}

module.exports = {
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
};
