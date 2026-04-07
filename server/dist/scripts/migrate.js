"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const pool = new pg_1.Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'hoppers',
    password: process.env.DB_PASSWORD ?? 'hoppers_dev',
    database: process.env.DB_NAME ?? 'hoppers',
});
async function migrate() {
    const migrationsDir = path_1.default.join(__dirname, '..', 'migrations');
    const files = fs_1.default
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
    for (const file of files) {
        console.log(`Running migration: ${file}`);
        const sql = fs_1.default.readFileSync(path_1.default.join(migrationsDir, file), 'utf-8');
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
