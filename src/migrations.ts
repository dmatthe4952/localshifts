import fs from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { createPgPool } from './pg.js';

type MigrationRow = { name: string; applied_at: string };

async function ensureTable(client: PoolClient) {
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedSet(client: PoolClient): Promise<Set<string>> {
  const res = await client.query<MigrationRow>('select name, applied_at from schema_migrations order by name');
  return new Set(res.rows.map((r) => r.name));
}

export async function runMigrations(params: {
  databaseUrl: string;
  migrationsDir: string;
  log?: (line: string) => void;
}) {
  const pool = createPgPool(params.databaseUrl);
  const client = await pool.connect();

  try {
    await client.query('begin');
    await ensureTable(client);
    const applied = await appliedSet(client);

    let names: string[];
    try {
      names = (await fs.readdir(params.migrationsDir)).filter((n) => n.endsWith('.sql')).sort();
    } catch {
      names = [];
    }

    for (const name of names) {
      if (applied.has(name)) continue;

      const sql = await fs.readFile(path.join(params.migrationsDir, name), 'utf8');
      if (sql.trim().length === 0) continue;

      await client.query(sql);
      await client.query('insert into schema_migrations(name) values ($1)', [name]);
      params.log?.(`applied ${name}`);
    }

    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
