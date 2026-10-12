import 'dotenv/config';
import app from './app.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET manquant ou trop court dans le fichier .env');
  process.exit(1);
}

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`API sur le port ${port}`));
