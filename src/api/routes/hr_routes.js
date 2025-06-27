// src/api/routes/hr_routes.js

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../../config/database');
const multer = require('multer');
const path = require('path');

// (Your multer configuration can be copied here or moved to a separate config file)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, `face-${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

const router = express.Router();

// --- Endpoint 1: Enroll an Existing Employee for Face Recognition ---
router.post('/enroll-face', upload.single('image'), async (req, res) => {
  const { employee_id, embedding } = req.body;
  
  if (!employee_id || !embedding || !req.file) {
    return res.status(400).json({ message: 'employee_id, embedding, and image file are required.' });
  }

  const imageUrl = `uploads/${req.file.filename}`;
  const connection = await pool.getConnection();

  try {
    const [employeeRows] = await connection.query('SELECT uuid FROM employees WHERE employee_id = ?', [employee_id]);
    if (employeeRows.length === 0) {
      return res.status(404).json({ message: 'Employee not found.' });
    }
    
    let employeeUuid = employeeRows[0].uuid;
    if (!employeeUuid) {
      employeeUuid = uuidv4();
      await connection.query('UPDATE employees SET uuid = ? WHERE employee_id = ?', [employeeUuid, employee_id]);
    }

    const embeddingId = uuidv4();
    const embeddingQuery = 'INSERT INTO face_embeddings_alt (entry_id, employee_uuid, embedding, image_url) VALUES (?, ?, ?, ?)';
    await connection.query(embeddingQuery, [embeddingId, employeeUuid, embedding, imageUrl]);

    res.status(201).json({ message: 'Face enrolled successfully for employee ' + employee_id });

  } catch (error) {
    console.error('Error during face enrollment:', error);
    res.status(500).json({ message: 'Server error during face enrollment.' });
  } finally {
    connection.release();
  }
});


// --- Endpoint 2: Log an attendance event to the 'attendance' table ---
router.post('/log-attendance', async (req, res) => {
    const { employee_uuid, event_type, location, address } = req.body; // Using uuid for recognition

    if (!employee_uuid || !event_type) {
        return res.status(400).json({ message: 'employee_uuid and event_type are required.' });
    }
    
    const connection = await pool.getConnection();
    try {
        const today = new Date().toISOString().slice(0, 10); // Get date in YYYY-MM-DD format
        const eventTime = new Date().toLocaleTimeString('en-US', { hour12: false }); // Get time in HH:MM:SS format
        
        // Find the employee's int ID from their UUID
        const [emp] = await connection.query('SELECT id FROM employees WHERE uuid = ?', [employee_uuid]);
        if (emp.length === 0) {
            return res.status(404).json({ message: 'Recognized face does not correspond to a known employee.' });
        }
        const employeeIdInt = emp[0].id;
        
        // Find if a record for this employee for today already exists
        const [attendanceRow] = await connection.query('SELECT id FROM attendance WHERE employee_id = ? AND date_sched = ?', [employeeIdInt, today]);

        if (attendanceRow.length > 0) {
            // Record exists, so UPDATE it
            const attendanceId = attendanceRow[0].id;
            const updateQuery = `UPDATE attendance SET \`${event_type}\` = ? WHERE id = ?`;
            await connection.query(updateQuery, [eventTime, attendanceId]);
            res.status(200).json({ message: `Successfully logged '${event_type}' for today.` });
        } else {
            // No record, so INSERT a new one
            const insertQuery = `INSERT INTO attendance (employee_id, date_sched, \`${event_type}\`) VALUES (?, ?, ?)`;
            await connection.query(insertQuery, [employeeIdInt, today, eventTime]);
            res.status(201).json({ message: `Successfully created log and logged '${event_type}' for today.` });
        }

    } catch (error) {
        console.error('Error logging attendance:', error);
        res.status(500).json({ message: 'Server error while logging attendance.' });
    } finally {
        connection.release();
    }
});


module.exports = router;