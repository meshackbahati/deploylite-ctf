const { pool } = require('./config/db');
const bcrypt = require('bcrypt');
const { logger } = require('./utils/logger');

async function seedDatabase() {
    const client = await pool.connect();
    try {
        const existing = await client.query(
            "SELECT id FROM users WHERE email = 'admin@deploylite.io'"
        );

        if (existing.rows.length > 0) {
            logger.info('Admin user already exists, skipping seed');
            return;
        }

        const passwordHash = await bcrypt.hash('D3pl0y!Admin2024', 12);

        await client.query(
            `UPDATE users SET password_hash = $1 WHERE email = 'admin@deploylite.io'`,
            [passwordHash]
        );

        const updated = await client.query(
            "SELECT id FROM users WHERE email = 'admin@deploylite.io' AND password_hash = $1",
            [passwordHash]
        );

        if (updated.rows.length > 0) {
            logger.info('Admin password hash updated successfully');
        } else {
            logger.info('Admin user exists with seeded hash from init.sql');
        }
    } catch (error) {
        logger.error('Database seed error:', { error: error.message });
    } finally {
        client.release();
    }
}

module.exports = { seedDatabase };
