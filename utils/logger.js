const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, 'app.log');

// Current time in ISO format, written at the start of every log line.
function timestamp() {
  return new Date().toISOString();
}

// Prints the line to the console and appends it to logs/app.log;
// the file write does not wait, so logging never slows a request down.
function write(level, msg) {
  const line = `[${timestamp()}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFile(logFile, line, () => {});
}

// One function per log level, e.g. logger.info('Server started').
module.exports = {
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
};
