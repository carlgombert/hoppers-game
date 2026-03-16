import { Pool } from 'pg';

export const db = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? 'hoppers',
  password: process.env.DB_PASSWORD ?? 'hoppers_dev',
  database: process.env.DB_NAME ?? 'hoppers',
});
