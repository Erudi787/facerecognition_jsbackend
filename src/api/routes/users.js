// src/api/routes/users.js

const express = require('express');
const { v4: uuidv4 } = require('uuid'); // To generate unique IDs
const pool = require('../../config/database'); // Our database connection pool
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, file.filename + '-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Create a new router object
const router = express.Router();

// Route: POST /api/users/register
// Desc:  Registers a new user and their first face embedding
router.post('/register', upload.single('image'), async (req, res) => {

  // The text fields are now in req.body
  const { name, embedding, expression } = req.body;

  // The file information is in req.file
  if (!req.file) {
    return res.status(400).json({ message: 'Image file is required.' });
  }

  // Basic validation
  if (!name || !embedding) {
    return res.status(400).json({ message: 'User name and face embedding are required.' });
  }

  // Construct the URL to the uploaded image
  // req.file.path gives a local path like 'public\uploads\image-167...'. We need to make it a URL path.
  const imageUrl = `uploads/${req.file.filename}`;

  const connection = await pool.getConnection();
  const userId = uuidv4();

  try {
    await connection.beginTransaction();

    const userQuery = 'INSERT INTO users (id, name) VALUES (?, ?)';
    await connection.query(userQuery, [userId, name]);

    const embeddingId = uuidv4();
    const embeddingQuery = 'INSERT INTO face_embeddings (entry_id, user_id, embedding, image_url, expression) VALUES (?, ?, ?, ?, ?)';
    // Note: The embedding from a multipart form will be a string, so we don't need to stringify it again.
    await connection.query(embeddingQuery, [embeddingId, userId, embedding, imageUrl, expression]);

    await connection.commit();
    res.status(201).json({ message: 'User registered successfully', userId: userId, imageUrl: imageUrl });

  } catch (error) {
    await connection.rollback();
    console.error('Error during user registration:', error);
    res.status(500).json({ message: 'Failed to register user due to a server error.' });
  } finally {
    connection.release();
  }
});
// router.post('/register', async (req, res) => {
//   // Get the data from the request body sent by the Flutter app
//   const { name, embedding, imageUrl, expression } = req.body;

//   // Basic validation
//   if (!name || !embedding) {
//     return res.status(400).json({ message: 'User name and face embedding are required.' });
//   }

//   const userId = uuidv4();
//   // Get a connection from the pool
//   const connection = await pool.getConnection();
//   try {
//     // Start a transaction
//     await connection.beginTransaction();

//     // 1. Create the new user in the 'users' table
//     const userQuery = 'INSERT INTO users (id, name) VALUES (?, ?)';
//     await connection.query(userQuery, [userId, name]);

//     // 2. Create the first face embedding in the 'face_embeddings' table
//     const embeddingId = uuidv4();
//     const embeddingQuery = 'INSERT INTO face_embeddings (entry_id, user_id, embedding, image_url, expression) VALUES (?, ?, ?, ?, ?)';
//     // The embedding array must be converted to a JSON string to be stored in the database
//     const embeddingJson = JSON.stringify(embedding); 
//     await connection.query(embeddingQuery, [embeddingId, userId, embeddingJson, imageUrl, expression]);

//     // If both queries were successful, commit the transaction
//     await connection.commit();
//     res.status(201).json({ message: 'User registered successfully', userId: userId });

//   } catch (error) {
//     // If any error occurred, roll back the transaction
//     await connection.rollback();
//     console.error('Error during user registration:', error);
//     res.status(500).json({ message: 'Failed to register user due to a server error.' });
//   } finally {
//     // ALWAYS release the connection back to the pool
//     connection.release();
//   }
// });

router.get('/faces', async (req, res) => {
  try {
    const query = `
      SELECT
        u.id as userId,
        u.name,
        fe.entry_id as entryId,
        fe.embedding,
        fe.image_url as imageUrl,
        fe.expression
      FROM users u
      JOIN face_embeddings fe ON u.id = fe.user_id
      WHERE fe.is_active = TRUE
    `;

    const [results] = await pool.query(query);
    const usersData = results.reduce((acc, row) => {
      const { userId, name, ...embeddingData } = row;
      // embeddingData.embedding = JSON.parse(embeddingData.embedding);

      if (!acc[userId]) {
        acc[userId] = { name: name, faces: [] };
      }
      acc[userId].faces.push(embeddingData);
      return acc;
    }, {});

    res.status(200).json(usersData);
  }
  catch (e) {
    console.error('Error fetching faces: ', e);
    res.status(500).json({ message: 'Failed to fetch face data.' });
  }
})

router.delete('/faces/:entryId', async (req, res) => {
  const { entryId } = req.params;
  const connection = await pool.getConnection();

  let userId;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT image_url, user_id FROM face_embeddings WHERE entry_id = ?', [entryId]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Face entry not found. '});
    }

    userId = rows[0].user_id;
    const imageUrl = rows[0].image_url;

    await connection.query('DELETE FROM face_embeddings WHERE entry_id = ?', [entryId]);
    if (imageUrl) {
      const imagePath = `public/${imageUrl}`;
      await fs.unlink(imagePath);
    }

    const [remainingFaces] = await connection.query('SELECT COUNT(*) as count FROM face_embeddings WHERE user_id = ?', [userId]);
    const faceCount = Number(remainingFaces[0].count);
    console.log(`Checking face count for user ${userId}: ${faceCount}`);

    if (faceCount === 0) {
      console.log(`No faces left for user ${userId}. Deleting user.`);
      await connection.query('DELETE FROM users WHERE id = ?', [userId]);
    }

    await connection.commit();
    res.status(200).json({ message: 'Face entry deleted successfully.' });
  }
  catch (e) {
    await connection.rollback();
    console.error('Error deleting face entry: ', e);
    res.status(500).json({ message: 'Failed to delete face entry.' });
  }
  finally {
    connection.release();
  }
});

// Export the router so our main server file can use it
module.exports = router;