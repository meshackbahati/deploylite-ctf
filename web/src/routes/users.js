const express = require('express');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

router.get('/profile', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, username, role, company, bio, avatar_url, created_at, last_login
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: result.rows[0] });
    } catch (error) {
        logger.error('Failed to fetch profile:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

router.put('/profile', authenticate, async (req, res) => {
    try {
        const { username, bio, company, avatar_url } = req.body;

        if (username) {
            const existing = await pool.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [username, req.user.id]
            );
            if (existing.rows.length > 0) {
                return res.status(409).json({ error: 'Username already taken' });
            }
        }

        const result = await pool.query(
            `UPDATE users SET
                username = COALESCE($1, username),
                bio = COALESCE($2, bio),
                company = COALESCE($3, company),
                avatar_url = COALESCE($4, avatar_url),
                updated_at = NOW()
             WHERE id = $5
             RETURNING id, email, username, role, company, bio, avatar_url`,
            [username, bio, company, avatar_url, req.user.id]
        );

        res.json({ user: result.rows[0], message: 'Profile updated successfully' });
    } catch (error) {
        logger.error('Failed to update profile:', { error: error.message });
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
