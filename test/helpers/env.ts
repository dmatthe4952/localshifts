import { vi } from 'vitest';

export async function loadAppForTest(env: Record<string, string>) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;

  // Ensure config.ts is re-evaluated with the test env.
  vi.resetModules();
  const { createDb } = await import('../../src/db.js');
  const { buildApp } = await import('../../src/app.js');
  const { runMigrations } = await import('../../src/migrations.js');

  return { createDb, buildApp, runMigrations };
}

