import mysql from 'mysql2/promise';
import 'dotenv/config';

// Pool de connexions partagé par toute l'application.
// dateStrings : les colonnes DATE restent des chaînes « AAAA-MM-JJ ». Sans cela, mysql2 les
// convertit en objets Date et le JSON décale le jour d'une journée (Madagascar est en UTC+3).
export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});
