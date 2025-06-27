// src/api/routes/attendance.js

const express = require('express');
const pool = require('../../config/database');

const router = express.Router();

// Route: POST /api/logs/event
// Desc:  Logs a time event (time_in, time_out, etc.) for a user.
//        This uses an UPSERT logic to either create a new daily record or update an existing one.
router.post('/event', async (req, res) => {
  const { userId, eventType, latitude, longitude, address, notes, photoUrl } = req.body;

  // 1. --- Validation ---
  const validEventTypes = ['time_in', 'time_out', 'break_in', 'break_out', 'ot_in', 'ot_out'];
  if (!userId || !eventType) {
    return res.status(400).json({ message: 'userId and eventType are required.' });
  }
  if (!validEventTypes.includes(eventType)) {
    return res.status(400).json({ message: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}` });
  }
  // --- End Validation ---


  // 2. --- Prepare Data ---
  // Get the current date in YYYY-MM-DD format
  const today = new Date().toISOString().slice(0, 10);
  // Get the current time in HH:MM:SS format
  const nowTime = new Date().toTimeString().slice(0, 8);

  // This creates a dynamic column name for our SQL query, e.g., 'time_in', 'time_out'
  const eventColumn = eventType; 

  // 3. --- Build and Execute the UPSERT Query ---
  // This is a powerful MySQL feature. It tries to INSERT a new row.
  // If the INSERT fails because of our UNIQUE KEY on (user_id, date_sched),
  // it will instead perform the UPDATE statement.
  try {
    const query = `
      INSERT INTO attendance
        (user_id, date_sched, ${eventColumn}, latitude, longitude, address, notes, photo_url)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ${eventColumn} = ?,
        latitude = ?,
        longitude = ?,
        address = ?,
        notes = ?,
        photo_url = ?;
    `;
    
    const params = [
      userId, today, nowTime, latitude, longitude, address, notes, photoUrl, // For the INSERT part
      nowTime, latitude, longitude, address, notes, photoUrl               // For the UPDATE part
    ];

    await pool.query(query, params);

    res.status(200).json({ message: `Successfully logged '${eventType}' at ${nowTime}` });

  } catch (error) {
    console.error('Error logging time event:', error);
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(404).json({ message: 'Failed to log: The provided user ID does not exist.' });
    }
    res.status(500).json({ message: 'Failed to log time event due to a server error.' });
  }
});

module.exports = router;