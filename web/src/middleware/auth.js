const { verifyToken } = require('../utils/jwt');
const { logger } = require('../utils/logger');

function authenticate(req, res, next) {
    const token = req.cookies.token || req.headers['x-auth-token'];

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        logger.warn(`Unauthorized admin access attempt by user ${req.user?.id}`);
        return res.status(403).json({ error: 'Administrator access required' });
    }
    next();
}

module.exports = { authenticate, requireAdmin };
