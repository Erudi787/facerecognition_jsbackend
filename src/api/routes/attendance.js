// src/api/routes/attendance.js

const express = require('express');
const pool = require('../../config/database');
const { v4: uuidv4 } = require('uuid'); // Import the uuid library

const router = express.Router();

// NEW, CORRECTED ROUTE
// This route is designed to work with your actual table schema.
router.post('/event', async (req, res) => {
  // 1. --- Get data from the request body ---
  const { userId, eventType, latitude, longitude, address } = req.body;

  // 2. --- Validation ---
  if (!userId || !eventType) {
    return res.status(400).json({ message: 'userId and eventType are required.' });
  }

  try {
    // 3. --- Prepare data for the query ---
    const logId = uuidv4(); // Generate a new unique ID for the log
    const eventTimestamp = new Date(); // Use the current time for the event

    // 4. --- Build and Execute the INSERT Query ---
    const query = `
      INSERT INTO time_logs
        (log_id, user_id, event_type, event_timestamp, latitude, longitude, address)
      VALUES
        (?, ?, ?, ?, ?, ?, ?);
    `;

    const params = [
      logId,
      userId,
      eventType,
      eventTimestamp,
      latitude,
      longitude,
      address
    ];

    await pool.query(query, params);

    res.status(201).json({ 
        message: `Successfully logged '${eventType}' for user ${userId}.`,
        logId: logId 
    });

  } catch (error) {
    console.error('Error logging time event:', error);

    // Check for a foreign key constraint failure
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'Failed to log: The provided user ID does not exist in the users table.' });
    }
    
    res.status(500).json({ message: 'Failed to log time event due to a server error.' });
  }
});

module.exports = router;