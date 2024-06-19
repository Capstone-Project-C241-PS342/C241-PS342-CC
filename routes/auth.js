import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { authenticateToken } from '../middleware/authMiddleware.js';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables from .env file
dotenv.config();

// Write the service account key to a file from the environment variable
// const keyFilePath = '/tmp/keyfile.json';
// const keyFileContent = Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'base64').toString('utf8');
// fs.writeFileSync(keyFilePath, keyFileContent);

// // Console log the content of the key file to verify
// const readKeyFileContent = fs.readFileSync(keyFilePath, 'utf8');
// console.log('Service Account Key File Content:', readKeyFileContent);

// Initialize Google Cloud Storage with the credentials
const storage = new Storage({
  keyFilename: "./service_account_key.json",
});
const bucket = storage.bucket('cc-c241-ps342'); // Replace with your bucket name

const router = express.Router();

// Function to make filenames URL-safe
const makeFilenameURLSafe = (filename) => {
  return filename.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '');
};

// Configure multer
const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

// Register Route
router.post('/register', upload.single('profile_picture'), (req, res) => {
  const { username, email, password } = req.body;
  const file = req.file;

  db.query('SELECT * FROM users WHERE username = ? OR email = ?', [username, email], (err, result) => {
    if (err) throw err;
    if (result.length > 0) {
      return res.status(400).send('Username or email already exists');
    }

    bcrypt.hash(password, 10, (err, hash) => {
      if (err) throw err;

      const saveUser = (profilePictureUrl) => {
        db.query('INSERT INTO users (username, email, password, profile_picture_url) VALUES (?, ?, ?, ?)', [username, email, hash, profilePictureUrl || null], (err, result) => {
          if (err) throw err;
          res.status(201).send('User registered');
        });
      };

      if (file) {
        const safeFilename = makeFilenameURLSafe(file.originalname);
        const blob = bucket.file(safeFilename);
        const blobStream = blob.createWriteStream({
          resumable: false,
          contentType: file.mimetype,
        });

        blobStream.on('error', (err) => {
          res.status(500).send('Error uploading to Google Cloud Storage');
        });

        blobStream.on('finish', () => {
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${safeFilename}`;
          saveUser(publicUrl);
        });

        blobStream.end(file.buffer);
      } else {
        saveUser(null);
      }
    });
  });
});

// Edit User Route
router.put('/edit/:id', authenticateToken, upload.single('profile_picture'), (req, res) => {
  const userId = req.params.id;
  const { username, email, password } = req.body;
  const file = req.file;

  db.query('SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?', [username, email, userId], (err, result) => {
    if (err) {
      return res.status(500).send('Server error');
    }
    if (result.length > 0) {
      return res.status(400).send('Username or email already exists');
    }

    const updateUser = (profilePictureUrl) => {
      const updateCallback = (err, result) => {
        if (err) {
          return res.status(500).send('Error updating user');
        }
        if (result.affectedRows === 0) {
          return res.status(404).send('User not found');
        }
        res.send('User updated successfully');
      };

      if (password) {
        bcrypt.hash(password, 10, (err, hash) => {
          if (err) {
            return res.status(500).send('Error hashing password');
          }
          db.query('UPDATE users SET username = ?, email = ?, password = ?, profile_picture_url = ? WHERE id = ?', [username, email, hash, profilePictureUrl, userId], updateCallback);
        });
      } else {
        db.query('UPDATE users SET username = ?, email = ?, profile_picture_url = ? WHERE id = ?', [username, email, profilePictureUrl, userId], updateCallback);
      }
    };

    if (file) {
      const safeFilename = makeFilenameURLSafe(file.originalname);
      const blob = bucket.file(safeFilename);
      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: file.mimetype,
      });

      blobStream.on('error', (err) => {
        res.status(500).send('Error uploading to Google Cloud Storage');
      });

      blobStream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${safeFilename}`;
        updateUser(publicUrl);
      });

      blobStream.end(file.buffer);
    } else {
      updateUser(req.body.profile_picture_url || null);
    }
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

  db.query('SELECT id, username, email, profile_picture_url FROM users WHERE id = ?', [userId], (err, result) => {
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
    db.query('SELECT id, username, email, profile_picture_url FROM users', (err, results) => {
      if (err) throw err;
      if (results.length === 0) {
        return res.status(404).send('No users found');
      }
  
      res.json(results);
    });
  });

// Edit User Route
// router.put('/edit/:id', authenticateToken, upload.single('profile_picture'), (req, res) => {
//   const userId = req.params.id;
//   const { username, email, password } = req.body;
//   const file = req.file;

//   db.query('SELECT * FROM users WHERE (username = ? OR email = ?) AND id != ?', [username, email, userId], (err, result) => {
//     if (err) {
//       return res.status(500).send('Server error');
//     }
//     if (result.length > 0) {
//       return res.status(400).send('Username or email already exists');
//     }

//     const updateUser = (profilePictureUrl) => {
//       const updateCallback = (err, result) => {
//         if (err) {
//           return res.status(500).send('Error updating user');
//         }
//         if (result.affectedRows === 0) {
//           return res.status(404).send('User not found');
//         }
//         res.send('User updated successfully');
//       };

//       if (password) {
//         bcrypt.hash(password, 10, (err, hash) => {
//           if (err) {
//             return res.status(500).send('Error hashing password');
//           }
//           db.query('UPDATE users SET username = ?, email = ?, password = ?, profile_picture_url = ? WHERE id = ?', [username, email, hash, profilePictureUrl, userId], updateCallback);
//         });
//       } else {
//         db.query('UPDATE users SET username = ?, email = ?, profile_picture_url = ? WHERE id = ?', [username, email, profilePictureUrl, userId], updateCallback);
//       }
//     };

//     if (file) {
//       const safeFilename = makeFilenameURLSafe(file.originalname);
//       const blob = bucket.file(safeFilename);
//       const blobStream = blob.createWriteStream({
//         resumable: false,
//         contentType: file.mimetype,
//       });

//       blobStream.on('error', (err) => {
//         res.status(500).send('Error uploading to Google Cloud Storage');
//       });

//       blobStream.on('finish', () => {
//         const publicUrl = `https://storage.googleapis.com/${bucket.name}/${safeFilename}`;
//         updateUser(publicUrl);
//       });

//       blobStream.end(file.buffer);
//     } else {
//       updateUser(req.body.profile_picture_url || null);
//     }
//   });
// });

// Add Learning Media Route
router.post('/learning_media', authenticateToken, (req, res) => {
  const { video_link, video_title, video_desc, thumbnail_link } = req.body;

  db.query('INSERT INTO learning_media (video_link, video_title, video_desc, thumbnail_link) VALUES (?, ?, ?, ?)', [video_link, video_title, video_desc, thumbnail_link], (err, result) => {
    if (err) {
      return res.status(500).send('Error adding learning media');
    }
    res.status(201).send('Learning media added successfully');
  });
});

// Delete Learning Media Route by ID
router.delete('/learning_media/:id', authenticateToken, (req, res) => {
  const mediaIdToDelete = req.params.id;

  db.query('DELETE FROM learning_media WHERE id = ?', [mediaIdToDelete], (err, result) => {
    if (err) {
      return res.status(500).send('Database error');
    }
    if (result.affectedRows === 0) {
      return res.status(404).send('Learning media not found');
    }

    res.send('Learning media deleted successfully');
  });
});

// Get All Learning Media Route
router.get('/learning_media', authenticateToken, (req, res) => {
  db.query('SELECT id, video_link, video_title, video_desc, thumbnail_link FROM learning_media', (err, results) => {
    if (err) {
      return res.status(500).send('Error retrieving learning media');
    }
    if (results.length === 0) {
      return res.status(404).send('No learning media found');
    }

    res.json(results);
  });
});

// Get Learning Media by ID Route
router.get('/learning_media/:id', authenticateToken, (req, res) => {
  const mediaId = req.params.id;

  db.query('SELECT id, video_link, video_title, video_desc, thumbnail_link FROM learning_media WHERE id = ?', [mediaId], (err, result) => {
    if (err) {
      return res.status(500).send('Error retrieving learning media');
    }
    if (result.length === 0) {
      return res.status(404).send('Learning media not found');
    }

    res.json(result[0]);
  });
});

export default router;


