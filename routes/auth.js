import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Register Route
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  db.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, result) => {
    if (err) throw err;
    if (result.length > 0) {
      return res.status(400).send('Username or email already exists');
    }

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) throw err;
      db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hash], (err, result) => {
        if (err) throw err;
        res.status(201).send('User registered');
      });
    });
  });
});

// Login Route
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, result) => {
    if (err) throw err;
    if (result.length === 0) {
      return res.status(400).send('Invalid email or password');
    }

    const user = result[0];

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) throw err;
      if (!isMatch) {
        return res.status(400).send('Invalid email or password');
      }

      const token = jwt.sign({ id: user.id }, 'your_jwt_secret', { expiresIn: '1h' });
      res.json({ token });
    });
  });
});

// Get User Route
router.get('/user', authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.query('SELECT id, username, email FROM users WHERE id = ?', [userId], (err, result) => {
    if (err) throw err;
    if (result.length === 0) {
      return res.status(404).send('User not found');
    }

    res.json(result[0]);
  });
});


// Delete User Route
router.delete('/user', authenticateToken, (req, res) => {
    const userId = req.user.id;
  
    db.query('DELETE FROM users WHERE id = ?', [userId], (err, result) => {
      if (err) throw err;
      if (result.affectedRows === 0) {
        return res.status(404).send('User not found');
      }
  
      res.send('User deleted successfully');
    });
  });

export default router;
