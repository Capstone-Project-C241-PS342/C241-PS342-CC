import express from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { authenticateToken } from '../middleware/authMiddleware.js';
import db from '../db.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
const bucket = storage.bucket('cc-c241-ps342'); // Replace with your bucket name

const multerStorage = multer.memoryStorage();
const upload = multer({ storage: multerStorage });

router.post('/upload-profile-picture', authenticateToken, upload.single('profile_picture'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  const blob = bucket.file(req.file.originalname);
  const blobStream = blob.createWriteStream({
    resumable: false,
    contentType: req.file.mimetype,
  });

  blobStream.on('error', (err) => {
    console.error('Error uploading to Google Cloud Storage:', err);
    res.status(500).send('Error uploading to Google Cloud Storage');
  });

  blobStream.on('finish', async () => {
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;

    db.query('UPDATE users SET profile_picture_url = ? WHERE id = ?', [publicUrl, req.user.id], (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('Database error');
      }
      res.status(200).send({ profilePictureUrl: publicUrl });
    });
  });

  blobStream.end(req.file.buffer);
});

export default router;