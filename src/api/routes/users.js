// src/api/routes/users.js

const express = require('express');
const { v4: uuidv4 } = require('uuid'); // To generate unique IDs
const pool = require('../../config/database'); // Our database connection pool

// Create a new router object
const router = express.Router();

// Route: POST /api/users/register
// Desc:  Registers a new user and their first face embedding
router.post('/register', async (req, res) => {
  // Get the data from the request body sent by the Flutter app
  const { name, embedding, imageUrl, expression } = req.body;

  // Basic validation
  if (!name || !embedding) {
    return res.status(400).json({ message: 'User name and face embedding are required.' });
  }

  // Get a connection from the pool
  const connection = await pool.getConnection();
  try {
    // Start a transaction
    await connection.beginTransaction();

    // 1. Create the new user in the 'users' table
    const userId = uuidv4();
    const userQuery = 'INSERT INTO users (id, name) VALUES (?, ?)';
    await connection.query(userQuery, [userId, name]);

    // 2. Create the first face embedding in the 'face_embeddings' table
    const embeddingId = uuidv4();
    const embeddingQuery = 'INSERT INTO face_embeddings (entry_id, user_id, embedding, image_url, expression) VALUES (?, ?, ?, ?, ?)';
    // The embedding array must be converted to a JSON string to be stored in the database
    const embeddingJson = JSON.stringify(embedding); 
    await connection.query(embeddingQuery, [embeddingId, userId, embeddingJson, imageUrl, expression]);

    // If both queries were successful, commit the transaction
    await connection.commit();
    res.status(201).json({ message: 'User registered successfully', userId: userId });

  } catch (error) {
    // If any error occurred, roll back the transaction
    await connection.rollback();
    console.error('Error during user registration:', error);
    res.status(500).json({ message: 'Failed to register user due to a server error.' });
  } finally {
    // ALWAYS release the connection back to the pool
    connection.release();
  }
});

// Export the router so our main server file can use it
module.exports = router;