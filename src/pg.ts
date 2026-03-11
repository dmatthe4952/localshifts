import fs from 'node:fs';
import pg from 'pg';

function readCaPem(): string | undefined {
  const pem = process.env.DATABASE_SSL_CA_PEM;
  if (pem && pem.trim()) return pem;
  const path = process.env.DATABASE_SSL_CA_FILE;
  if (path && path.trim()) return fs.readFileSync(path, 'utf8');
  return undefined;
}

function sslOptionsFromConnectionString(connectionString: string): any | undefined {
  try {
    const url = new URL(connectionString);
    const sslmode = (url.searchParams.get('sslmode') ?? '').toLowerCase();
    if (!sslmode) return undefined;

    // Map libpq-ish sslmode to node-postgres ssl options.
    // - require: encrypt but do not validate cert chain/hostname
    // - verify-ca / verify-full: validate cert (and in verify-full, hostname)
    // node-postgres doesn't implement sslmode semantics directly, so we approximate with rejectUnauthorized.
    if (sslmode === 'require') return { rejectUnauthorized: false };

    if (sslmode === 'verify-ca' || sslmode === 'verify-full') {
      const ca = readCaPem();
      return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
    }
  } catch {
    // Ignore parse errors; callers can still pass explicit env vars via pg defaults if desired.
  }
  return undefined;
}

export function createPgPool(connectionString: string): any {
  const ssl = sslOptionsFromConnectionString(connectionString);
  return new pg.Pool({ connectionString, ssl });
}
