import express from 'express';
import cors from 'cors';
import { pool } from './config/db.js';
import routes from './routes/index.js';
import { notFound, gestionErreurs } from './middlewares/error.middleware.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS nb_roles FROM role');
    res.json({ status: 'ok', ...rows[0] });
  } catch (err) {
    next(err);
  }
});

app.use('/api', routes);
app.use(notFound);
app.use(gestionErreurs);

export default app;
