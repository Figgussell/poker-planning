import nextEnv from '@next/env';
import { Pool } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

nextEnv.loadEnvConfig(process.cwd());
const connectionString = process.env.DATABASE_ADMIN_URL;
if (!connectionString) throw new Error('Set DATABASE_ADMIN_URL to the migration owner connection string.');
const pool = new Pool({ connectionString });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(260026)");
  await client.query('CREATE TABLE IF NOT EXISTS public.poker_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of (await readdir('db/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(`db/migrations/${name}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('SELECT checksum FROM public.poker_migrations WHERE name = $1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO public.poker_migrations(name, checksum) VALUES ($1, $2)', [name, checksum]);
    console.log(`Applied ${name}`);
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Migration failed', { code: error.code ?? 'UNKNOWN' });
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
