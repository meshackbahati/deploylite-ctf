const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: {
        error: 'Too many requests. Please try again later.',
        retryAfter: '15 minutes'
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: {
        error: 'Too many authentication attempts. Please try again later.',
        retryAfter: '15 minutes'
    }
});

module.exports = { apiLimiter, authLimiter };
