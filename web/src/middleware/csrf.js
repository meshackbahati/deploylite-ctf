const crypto = require('crypto');

function csrfProtection(req, res, next) {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
        return next();
    }

    const csrfCookie = req.cookies._csrf;
    const csrfHeader = req.headers['x-csrf-token'];

    if (!csrfCookie || !csrfHeader) {
        return next();
    }

    if (csrfCookie !== csrfHeader) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}

module.exports = { csrfProtection };
