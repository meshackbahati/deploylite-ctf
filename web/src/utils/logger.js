const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[process.env.LOG_LEVEL || 'info'];

function formatMessage(level, message, meta) {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function writeLog(level, message, meta) {
    if (levels[level] > currentLevel) return;

    const formatted = formatMessage(level, message, meta);
    const logFile = path.join(LOG_DIR, `${level}.log`);

    console.log(formatted);

    try {
        fs.appendFileSync(logFile, formatted + '\n');
    } catch (err) {
        // Silently fail if log directory isn't writable
    }
}

const logger = {
    error: (message, meta) => writeLog('error', message, meta),
    warn: (message, meta) => writeLog('warn', message, meta),
    info: (message, meta) => writeLog('info', message, meta),
    debug: (message, meta) => writeLog('debug', message, meta)
};

module.exports = { logger };
