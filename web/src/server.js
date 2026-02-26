const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { pool } = require('./config/db');
const { logger } = require('./utils/logger');

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const buildRoutes = require('./routes/builds');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) }
}));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/builds', buildRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', version: '2.4.1', uptime: process.uptime() });
});

app.get('/api/csrf-token', (req, res) => {
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('_csrf', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production'
    });
    res.json({ csrfToken: token });
});

const htmlPages = ['login', 'register', 'dashboard', 'project', 'build-logs', 'profile', 'admin'];
htmlPages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', `${page}.html`));
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Internal server error'
            : err.message
    });
});

async function startServer() {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        logger.info('Database connection established');

        // Seed admin password hash (non-fatal if it fails)
        try {
            const bcrypt = require('bcrypt');
            const adminEmail = 'admin@deploylite.io';
            const adminPassword = 'D3pl0y!Admin2024';
            const { rows } = await pool.query(
                'SELECT id, password_hash FROM users WHERE email = $1',
                [adminEmail]
            );
            if (rows.length > 0) {
                const isValid = await bcrypt.compare(adminPassword, rows[0].password_hash).catch(() => false);
                if (!isValid) {
                    const hash = await bcrypt.hash(adminPassword, 12);
                    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, adminEmail]);
                    logger.info('Admin password hash updated');
                }
            }
        } catch (seedErr) {
            logger.info('Admin seed skipped: ' + (seedErr.message || 'unknown error'));
        }

        app.listen(PORT, '0.0.0.0', () => {
            logger.info(`DeployLite server running on port ${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
