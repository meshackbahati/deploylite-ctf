const express = require('express');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

router.use(authenticate);
router.use(requireAdmin);

router.get('/audit-logs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        const action = req.query.action;

        let query = `
            SELECT al.*, u.username, u.email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
        `;
        const params = [];

        if (action) {
            query += ' WHERE al.action = $1';
            params.push(action);
        }

        query += ' ORDER BY al.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const result = await pool.query(query, params);

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM audit_logs' + (action ? ' WHERE action = $1' : ''),
            action ? [action] : []
        );

        res.json({
            logs: result.rows,
            pagination: {
                page,
                limit,
                total: parseInt(countResult.rows[0].count),
                pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
            }
        });
    } catch (error) {
        logger.error('Failed to fetch audit logs:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});

router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, email, username, role, company, created_at, last_login
             FROM users ORDER BY created_at DESC`
        );
        res.json({ users: result.rows });
    } catch (error) {
        logger.error('Failed to fetch users:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const users = await pool.query('SELECT COUNT(*) FROM users');
        const projects = await pool.query('SELECT COUNT(*) FROM projects');
        const builds = await pool.query('SELECT COUNT(*) FROM builds');
        const successBuilds = await pool.query("SELECT COUNT(*) FROM builds WHERE status = 'success'");
        const failedBuilds = await pool.query("SELECT COUNT(*) FROM builds WHERE status = 'failed'");

        res.json({
            stats: {
                totalUsers: parseInt(users.rows[0].count),
                totalProjects: parseInt(projects.rows[0].count),
                totalBuilds: parseInt(builds.rows[0].count),
                successfulBuilds: parseInt(successBuilds.rows[0].count),
                failedBuilds: parseInt(failedBuilds.rows[0].count)
            }
        });
    } catch (error) {
        logger.error('Failed to fetch stats:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

module.exports = router;
