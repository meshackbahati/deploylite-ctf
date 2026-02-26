const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.POSTGRES_USER || 'deploylite',
    password: process.env.POSTGRES_PASSWORD || 'DL_db_s3cure_2024!',
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'deploylite',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
});

module.exports = { pool };
