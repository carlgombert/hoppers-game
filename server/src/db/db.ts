import { Pool } from 'pg';

const dbEnvKeys = Object.keys(process.env).filter(k => k.startsWith('PG') || k.startsWith('POSTGRES') || k === 'DATABASE_URL');
console.log(`🔍 Found ${dbEnvKeys.length} DB variables: [${dbEnvKeys.join(', ')}]`);

const connectionString = process.env.DATABASE_URL;

if (connectionString) {
  const masked = connectionString.replace(/:([^:@]+)@/, ':****@');
  console.log(`📡 Connecting via DATABASE_URL: ${masked}`);
} else if (process.env.PGHOST) {
  console.log(`📡 Connecting via PGHOST: ${process.env.PGHOST}:${process.env.PGPORT} [DB: ${process.env.PGDATABASE}]`);
}

export const db = new Pool({
  connectionString: connectionString,
  // If connectionString is missing, pg Pool automatically 
  // uses PGHOST, PGUSER, PGPASSWORD, PGDATABASE, and PGPORT
});
