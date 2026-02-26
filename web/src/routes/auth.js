const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { signToken } = require('../utils/jwt');
const { authLimiter } = require('../middleware/rateLimit');
const { logger } = require('../utils/logger');

const router = express.Router();

router.use(authLimiter);

router.post('/register', async (req, res) => {
    try {
        const { email, username, password, company } = req.body;

        if (!email || !username || !password) {
            return res.status(400).json({ error: 'Email, username, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1 OR username = $2',
            [email, username]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Email or username already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO users (email, username, password_hash, company)
             VALUES ($1, $2, $3, $4) RETURNING id, email, username, role, company, created_at`,
            [email, username, passwordHash, company || null]
        );

        const user = result.rows[0];
        const token = signToken({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            iss: 'deploylite'
        });

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, resource_type, details, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
            [user.id, 'user.register', 'auth', JSON.stringify({ email: user.email }), req.ip]
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.status(201).json({
            message: 'Account created successfully',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                company: user.company
            }
        });
    } catch (error) {
        logger.error('Registration error:', { error: error.message });
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await pool.query(
            'SELECT id, email, username, password_hash, role, company FROM users WHERE email = $1',
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            await pool.query(
                `INSERT INTO audit_logs (user_id, action, resource_type, details, ip_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [user.id, 'user.login_failed', 'auth', JSON.stringify({ reason: 'invalid_password' }), req.ip]
            );
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

        const token = signToken({
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            iss: 'deploylite'
        });

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, resource_type, details, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
            [user.id, 'user.login', 'auth', JSON.stringify({ success: true }), req.ip]
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                role: user.role,
                company: user.company
            }
        });
    } catch (error) {
        logger.error('Login error:', { error: error.message });
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
});

router.get('/me', async (req, res) => {
    const token = req.cookies.token || req.headers['x-auth-token'];
    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { verifyToken } = require('../utils/jwt');
    const decoded = verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        const result = await pool.query(
            'SELECT id, email, username, role, company, bio, avatar_url, created_at, last_login FROM users WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        logger.error('Auth check error:', { error: error.message });
        res.status(500).json({ error: 'Failed to verify authentication' });
    }
});

module.exports = router;
