const express = require('express');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { logger } = require('../utils/logger');

const router = express.Router();

router.use(apiLimiter);

router.get('/', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.username as owner_name
             FROM projects p
             JOIN users u ON p.owner_id = u.id
             WHERE p.owner_id = $1 OR p.is_public = true
             ORDER BY p.updated_at DESC`,
            [req.user.id]
        );
        res.json({ projects: result.rows });
    } catch (error) {
        logger.error('Failed to fetch projects:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});

router.get('/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT p.*, u.username as owner_name, u.avatar_url as owner_avatar
             FROM projects p
             JOIN users u ON p.owner_id = u.id
             WHERE p.id = $1 AND (p.owner_id = $2 OR p.is_public = true)`,
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json({ project: result.rows[0] });
    } catch (error) {
        logger.error('Failed to fetch project:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

router.post('/', authenticate, async (req, res) => {
    try {
        const { name, description, repo_url, tech_stack, is_public, build_config } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }

        if (name.length > 255) {
            return res.status(400).json({ error: 'Project name too long' });
        }

        const result = await pool.query(
            `INSERT INTO projects (name, description, repo_url, tech_stack, is_public, build_config, owner_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [name, description || '', repo_url || '', tech_stack || '', is_public || false, build_config || '{}', req.user.id]
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.user.id, 'project.create', 'project', result.rows[0].id, JSON.stringify({ name }), req.ip]
        );

        res.status(201).json({ project: result.rows[0] });
    } catch (error) {
        logger.error('Failed to create project:', { error: error.message });
        res.status(500).json({ error: 'Failed to create project' });
    }
});

router.put('/:id', authenticate, async (req, res) => {
    try {
        const { name, description, repo_url, tech_stack, is_public, build_config } = req.body;

        const existing = await pool.query(
            'SELECT * FROM projects WHERE id = $1 AND owner_id = $2',
            [req.params.id, req.user.id]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        const result = await pool.query(
            `UPDATE projects SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                repo_url = COALESCE($3, repo_url),
                tech_stack = COALESCE($4, tech_stack),
                is_public = COALESCE($5, is_public),
                build_config = COALESCE($6, build_config),
                updated_at = NOW()
             WHERE id = $7 RETURNING *`,
            [name, description, repo_url, tech_stack, is_public, build_config, req.params.id]
        );

        res.json({ project: result.rows[0] });
    } catch (error) {
        logger.error('Failed to update project:', { error: error.message });
        res.status(500).json({ error: 'Failed to update project' });
    }
});

router.delete('/:id', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.user.id, 'project.delete', 'project', req.params.id, req.ip]
        );

        res.json({ message: 'Project deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete project:', { error: error.message });
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

router.get('/:id/share', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, preview_url, is_public FROM projects WHERE id = $1 AND owner_id = $2',
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = result.rows[0];
        const shareUrl = `${req.protocol}://${req.get('host')}/preview/${project.id}`;

        res.json({
            shareUrl,
            previewUrl: project.preview_url,
            isPublic: project.is_public
        });
    } catch (error) {
        logger.error('Failed to generate share link:', { error: error.message });
        res.status(500).json({ error: 'Failed to generate share link' });
    }
});

module.exports = router;
