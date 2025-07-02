const express = require('express');
const pool = require('../../config/database');

const router = express.Router();

// Route: POST /api/logs/event
// Desc:  Logs a time event (time_in, etc.) using an UPSERT logic.
router.post('/event', async (req, res) => {
  const { userId, eventType, latitude, longitude, address, notes } = req.body;

  // --- Validation ---
  const validEventTypes = ['time_in', 'time_out', 'break_in', 'break_out', 'ot_in', 'ot_out'];
  if (!userId || !eventType) {
    return res.status(400).json({ message: 'userId and eventType are required.' });
  }
  if (!validEventTypes.includes(eventType)) {
    return res.status(400).json({ message: `Invalid eventType. Must be one of: ${validEventTypes.join(', ')}` });
  }
  // --- End Validation ---

  // --- Prepare Data ---
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const nowTime = new Date().toTimeString().slice(0, 8); // HH:MM:SS
  const eventColumn = eventType; // Dynamic column name like 'time_in'

  try {
    // This powerful MySQL query will INSERT a new row if the combination of
    // employee_id and date_sched doesn't exist. If it DOES exist, it will
    // perform the UPDATE part of the statement instead.
    const query = `
      INSERT INTO attendance_alt
        (employee_id, date_sched, ${eventColumn}, latitude, longitude, address, notes)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ${eventColumn} = VALUES(${eventColumn}),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        address = VALUES(address),
        notes = VALUES(notes),
        last_updated_at = NOW(); 
    `;

    const params = [
      userId, today, nowTime, latitude, longitude, address, notes
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

// This route can be used by a dashboard to get the formatted daily view
router.get('/summary/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // This query JOINS the users table to get the user's name with the logs
    const query = `
            SELECT 
                tl.*,
                u.name AS personName 
            FROM time_logs tl
            JOIN users u ON tl.employee_id = u.id
            WHERE tl.employee_id = ? 
            ORDER BY tl.date_sched DESC;
        `;
    const [rows] = await pool.query(query, [userId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching user log summary:", error);
    res.status(500).json({ message: "Failed to fetch log summary." });
  }
});


module.exports = router;