const express = require('express');
const pool = require('./config/database');
const userRoutes = require('./api/routes/users');
const logRoutes = require('./api/routes/logs');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

app.get('/', (req, res) => {
    res.send('Backend is running bitchhh');
});

app.get('/api/test-db', async (req, res) => {
    try {
        const [results, fields] = await pool.query('SELECT NOW() as now');

        res.json({
            message: 'Database connection successful!',
            databaseTime: results[0].now,
        });
    }
    catch (e) {
        console.error('Database query failed: ', e);
        res.status(500).json({
            message: 'Error connecting to database.',
            error: e.message,
        });
    }
})

app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});