import express from 'express';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth.js';
import uploadProfilePicture from './routes/uploadProfilePicture.js';

const app = express();
const PORT = 3000

app.use(bodyParser.json());
app.use('/api/auth', authRoutes);
app.use('/api/picture', uploadProfilePicture);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
