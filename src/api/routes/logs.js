// src/api/routes/logs.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../config/database');

const router = express.Router();

// Route: POST /api/logs
// Desc:  Creates a new time log event (e.g., time_in, time_out) for a user
router.post('/', async (req, res) => {
  // Get the data from the request body sent by the Flutter app
  const { userId, eventType, latitude, longitude, address } = req.body;

  // --- Basic Validation ---
  const validEventTypes = ['time_in', 'time_out', 'break_in', 'break_out', 'overtime_in', 'overtime_out'];
  if (!userId || !eventType) {
    return res.status(400).json({ message: 'userId and eventType are required.' });
  }
  if (!validEventTypes.includes(eventType)) {
    return res.status(400).json({ message: 'Invalid eventType provided.' });
  }
  // --- End Validation ---

  const logId = uuidv4();
  // Get the current time from the server to ensure consistency
  const eventTimestamp = new Date();

  try {
    const query = `
      INSERT INTO time_logs 
        (log_id, user_id, event_type, event_timestamp, latitude, longitude, address) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    await pool.query(query, [logId, userId, eventType, eventTimestamp, latitude, longitude, address]);

    res.status(201).json({ message: 'Time log created successfully', logId: logId });

  } catch (error) {
    console.error('Error creating time log:', error);
    // Check for a foreign key constraint error specifically
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(404).json({ message: 'Failed to create log: The provided user ID does not exist.' });
    }
    res.status(500).json({ message: 'Failed to create time log due to a server error.' });
  }
});

module.exports = router;