import express from 'express';
import bodyParser from 'body-parser';
import authRoutes from './routes/auth.js';

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
