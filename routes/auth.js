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
  const { username, email, password } = req.body;

  // Determine the field to use for login
  const loginField = username ? { field: 'username', value: username } : { field: 'email', value: email };

  db.query(`SELECT * FROM users WHERE ${loginField.field} = ?`, [loginField.value], (err, results) => {
    if (err) {
      return res.status(500).send('Server error');
    }
    if (results.length === 0) {
      return res.status(400).send('Invalid login credentials');
    }

    const user = results[0];

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err) {
        return res.status(500).send('Error checking password');
      }
      if (!isMatch) {
        return res.status(400).send('Invalid login credentials');
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


// Delete User Route by ID
router.delete('/delete/:id', authenticateToken, (req, res) => {
  // You might want to add authorization logic here to check if the requesting user has the rights to delete another user.
  const userIdToDelete = req.params.id;

  db.query('DELETE FROM users WHERE id = ?', [userIdToDelete], (err, result) => {
    if (err) return res.status(500).send('Database error');
    if (result.affectedRows === 0) {
      return res.status(404).send('User not found');
    }

    res.send('User deleted successfully');
  });
});


  // Get All Users Route
  router.get('/users', authenticateToken, (req, res) => {
    db.query('SELECT id, username, email FROM users', (err, results) => {
      if (err) throw err;
      if (results.length === 0) {
        return res.status(404).send('No users found');
      }
  
      res.json(results);
    });
  });

// Edit User Route
router.put('/edit/:id', authenticateToken, (req, res) => {
  const userId = req.params.id; // the ID of the user to edit
  const { username, email, password } = req.body;
  

  // Check if the new username or email already exists in other users
  db.query('SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?', [username, email, userId], (err, result) => {
      if (err) {
          return res.status(500).send('Server error');
      }
      if (result.length > 0) {
          return res.status(400).send('Username or email already exists');
      }

      // If password is provided, hash it
      if (password) {
          bcrypt.hash(password, 10, (err, hash) => {
              if (err) {
                  return res.status(500).send('Error hashing password');
              }
              // Update user with hashed password
              db.query('UPDATE users SET username = ?, email = ?, password = ? WHERE id = ?', [username, email, hash, userId], updateCallback);
          });
      } else {
          // Update user without changing password
          db.query('UPDATE users SET username = ?, email = ? WHERE id = ?', [username, email, userId], updateCallback);
      }
  });

  function updateCallback(err, result) {
      if (err) {
          return res.status(500).send('Error updating user');
      }
      if (result.affectedRows === 0) {
          return res.status(404).send('User not found');
      }
      res.send('User updated successfully');
  }
});


export default router;
