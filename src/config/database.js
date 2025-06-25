// src/config/database.js

require('dotenv').config();

console.log('--- Checking Environment Variables ---');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('------------------------------------');

const mysql = require('mysql2/promise');

console.log('Creating database connection pool...');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Successfully connected to the MySQL database.');
        connection.release();
    } catch (e) {
        console.error('❌ Error connecting to database: ', e);
    }
}

testConnection();

module.exports = pool;