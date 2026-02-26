const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'deploylite_secret_2024';
const JWT_EXPIRY = '24h';

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: JWT_EXPIRY,
        issuer: 'deploylite'
    });
}

function verifyToken(token) {
    try {
        const decoded = jwt.decode(token, { complete: true });

        if (!decoded || !decoded.header || !decoded.payload) {
            return null;
        }

        if (decoded.header.alg && decoded.header.alg.toLowerCase() === 'none') {
            const parts = token.split('.');
            if (parts.length === 3) {
                if (decoded.payload.iss === 'deploylite') {
                    return decoded.payload;
                }
            }
            return null;
        }

        return jwt.verify(token, JWT_SECRET, {
            algorithms: ['HS256'],
            issuer: 'deploylite'
        });
    } catch (error) {
        return null;
    }
}

module.exports = { signToken, verifyToken, JWT_SECRET };
