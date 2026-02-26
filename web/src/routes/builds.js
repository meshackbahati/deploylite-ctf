const express = require('express');
const axios = require('axios');
const { pool } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const router = express.Router();

const BUILD_RUNNER_URL = process.env.BUILD_RUNNER_URL || 'http://build-runner:5000';

router.post('/trigger', authenticate, requireAdmin, async (req, res) => {
    try {
        const { project_id, repo_url, build_script, branch } = req.body;

        if (!project_id || !repo_url || !build_script) {
            return res.status(400).json({
                error: 'project_id, repo_url, and build_script are required'
            });
        }

        const project = await pool.query(
            'SELECT * FROM projects WHERE id = $1',
            [project_id]
        );

        if (project.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const buildResult = await pool.query(
            `INSERT INTO builds (project_id, triggered_by, status, build_script, repo_url, branch)
             VALUES ($1, $2, 'running', $3, $4, $5) RETURNING *`,
            [project_id, req.user.id, build_script, repo_url, branch || 'main']
        );

        const build = buildResult.rows[0];

        await pool.query(
            'UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2',
            ['building', project_id]
        );

        let runnerResponse;
        try {
            runnerResponse = await axios.post(`${BUILD_RUNNER_URL}/internal/run`, {
                build_id: build.id,
                repo_url: repo_url,
                build_script: build_script,
                branch: branch || 'main'
            }, {
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (runnerError) {
            logger.error('Build runner communication error:', {
                error: runnerError.message,
                url: `${BUILD_RUNNER_URL}/internal/run`
            });

            await pool.query(
                `UPDATE builds SET status = 'failed', log_output = $1, completed_at = NOW()
                 WHERE id = $2`,
                [`Build runner error: ${runnerError.message}`, build.id]
            );

            await pool.query(
                'UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2',
                ['failed', project_id]
            );

            return res.status(502).json({
                error: 'Build runner unavailable',
                build_id: build.id
            });
        }

        const logOutput = runnerResponse.data.output || 'No output received';
        const buildStatus = runnerResponse.data.success ? 'success' : 'failed';

        await pool.query(
            `UPDATE builds SET status = $1, log_output = $2, completed_at = NOW(),
             duration_ms = $3 WHERE id = $4`,
            [buildStatus, logOutput, runnerResponse.data.duration_ms || 0, build.id]
        );

        await pool.query(
            'UPDATE projects SET status = $1, updated_at = NOW() WHERE id = $2',
            [buildStatus === 'success' ? 'active' : 'failed', project_id]
        );

        await pool.query(
            `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                req.user.id, 'build.trigger', 'build', build.id,
                JSON.stringify({ project_id, status: buildStatus }),
                req.ip
            ]
        );

        res.json({
            message: 'Build completed',
            build: {
                id: build.id,
                status: buildStatus,
                log_output: logOutput,
                duration_ms: runnerResponse.data.duration_ms
            }
        });
    } catch (error) {
        logger.error('Build trigger error:', { error: error.message });
        res.status(500).json({ error: 'Failed to trigger build' });
    }
});

router.get('/:projectId', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.*, u.username as triggered_by_name
             FROM builds b
             JOIN users u ON b.triggered_by = u.id
             WHERE b.project_id = $1
             ORDER BY b.created_at DESC
             LIMIT 50`,
            [req.params.projectId]
        );

        res.json({ builds: result.rows });
    } catch (error) {
        logger.error('Failed to fetch builds:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch builds' });
    }
});

router.get('/log/:buildId', authenticate, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT b.*, p.name as project_name
             FROM builds b
             JOIN projects p ON b.project_id = p.id
             WHERE b.id = $1`,
            [req.params.buildId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Build not found' });
        }

        res.json({ build: result.rows[0] });
    } catch (error) {
        logger.error('Failed to fetch build log:', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch build log' });
    }
});

module.exports = router;
