import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (connectionString) {
  const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
  console.log(`📡 Migrating via DATABASE_URL: ${masked}`);
}

const pool = new Pool({
  connectionString: connectionString,
  // Fallback for local dev if DATABASE_URL is missing
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'hoppers',
  password: process.env.DB_PASSWORD || 'hoppers_dev',
  database: process.env.DB_NAME || 'hoppers',
});

async function migrate() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
    console.log(`  ✓ ${file}`);
  }

  await pool.end();
  console.log('All migrations complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
