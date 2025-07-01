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

router.post('/employees', async (req, res) => {
  const { employee_id, firstname, lastname, position_id, schedule_id } = req.body;

  if (!employee_id || !firstname || !lastname || !position_id || !schedule_id) {
    return res.status(400).json({ message: 'Missing required employee fields.' });
  }

  const employeeUuid = uuidv4();

  const connection = await pool.getConnection();
  try {
    const query = `
      INSERT INTO employees
        (id, employee_id, firstname, lastname, position_id, schedule_id, uuid, created_on)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE())
    `;

    await connection.query(query, [null, employee_id, firstname, lastname, position_id, schedule_id, employeeUuid]);

    res.status(201).json({ message: 'Employee created successfully.', uuid: employeeUuid });

  }
  catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An employee with this ID already exists.' });
    }
    console.error('Error creating employee:', error);
    res.status(500).json({ message: 'Server error while creating employee.' });
  }
  finally {
    connection.release();
  }
})

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

router.get('/employee/:employee_id', async (req, res) => {
  const { employee_id } = req.params;
  const connection = await pool.getConnection();

  try {
    const [employeeRows] = await connection.query('SELECT uuid, firstname, lastname FROM employees WHERE employee_id = ?', [employee_id]);

    if (employeeRows.length == 0) {
      return res.status(404).json({ message: 'Employee ID not found.' });
    }

    const employee = employeeRows[0];
    const employeeUuid = employee.uuid;

    if (!employeeUuid) {
      return res.status(404).json({ message: 'This employee has not been enrolled for face recognition.' });
    }

    const [embeddingRows] = await connection.query('SELECT entry_id, embedding, image_url FROM face_embeddings_alt WHERE employee_uuid = ?', [employeeUuid]);

    if (embeddingRows.length === 0) {
      return res.status(404).json({ message: 'This employee has been enrolled but has no face data. Please contact an admin.' });
    }

    res.status(200).json({
      name: `${employee.firstname} ${employee.lastname}`,
      faces: embeddingRows.map(row => ({
        entryId: row.entryId,
        embedding: row.embedding,
        imageUrl: row.image_url
      }))
    });
  }
  catch (e) {
    console.error(`Error fetching data for employee ${employee_id}: `, e);
    res.status(500).json({ message: 'Server error while fetching employee data.' });
  }
});

// --- Endpoint 3: Sync batch attendance data from offline devices ---
router.post('/attendance/sync', async (req, res) => {
  const records = req.body; // Expecting an array of attendance records

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'Request body must be a non-empty array of attendance records.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const record of records) {
      const { personName, timeIn, timeOut, breakIn, breakOut, overtimeIn, overtimeOut, latitude, longitude, address } = record;

      if (!personName || !timeIn) {
        console.warn('Skipping record due to missing personName or timeIn:', record);
        continue;
      }

      // Find employee_id from personName. This assumes personName is unique.
      const nameParts = personName.split(' ');
      const firstname = nameParts[0];
      const lastname = nameParts.slice(1).join(' ');

      const [emp] = await connection.query('SELECT id FROM employees WHERE firstname = ? AND lastname = ?', [firstname, lastname]);

      if (emp.length === 0) {
        console.warn(`Skipping record for unknown employee: ${personName}`);
        continue;
      }
      const employeeIdInt = emp[0].id;

      // Use the date from the timeIn record as the schedule date
      const dateSched = new Date(timeIn).toISOString().slice(0, 10);

      const [attendanceRow] = await connection.query('SELECT id FROM attendance WHERE employee_id = ? AND date_sched = ?', [employeeIdInt, dateSched]);

      // Helper to format DateTime string to TIME format (HH:MM:SS)
      const formatTime = (dateTimeString) => {
        if (!dateTimeString) return null;
        return new Date(dateTimeString).toLocaleTimeString('en-US', { hour12: false });
      };

      if (attendanceRow.length > 0) {
        // Record exists, so UPDATE it with all available data from the app
        const attendanceId = attendanceRow[0].id;
        const updateQuery = `UPDATE attendance SET
            time_in = COALESCE(?, time_in),
            break_out = COALESCE(?, break_out),
            break_in = COALESCE(?, break_in),
            time_out = COALESCE(?, time_out),
            ot_in = COALESCE(?, ot_in),
            ot_out = COALESCE(?, ot_out),
            latitude = COALESCE(?, latitude),
            longitude = COALESCE(?, longitude),
            address = COALESCE(?, address)
            WHERE id = ?`;
        await connection.query(updateQuery, [
            formatTime(timeIn),
            formatTime(breakOut),
            formatTime(breakIn),
            formatTime(timeOut),
            formatTime(overtimeIn),
            formatTime(overtimeOut),
            latitude,
            longitude,
            address,
            attendanceId
        ]);
      } else {
        // No record for that day, so INSERT a new one
        const insertQuery = `INSERT INTO attendance
            (employee_id, date_sched, time_in, break_out, break_in, time_out, ot_in, ot_out, latitude, longitude, address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await connection.query(insertQuery, [
            employeeIdInt,
            dateSched,
            formatTime(timeIn),
            formatTime(breakOut),
            formatTime(breakIn),
            formatTime(timeOut),
            formatTime(overtimeIn),
            formatTime(overtimeOut),
            latitude,
            longitude,
            address
        ]);
      }
    }

    await connection.commit();
    res.status(200).json({ message: 'Sync completed successfully.' });

  } catch (error) {
    await connection.rollback();
    console.error('Error syncing attendance:', error);
    res.status(500).json({ message: 'Server error while syncing attendance.' });
  } finally {
    connection.release();
  }
});

module.exports = router;