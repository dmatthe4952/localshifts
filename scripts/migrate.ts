import path from 'node:path';
import { config } from '../src/config.js';
import { runMigrations } from '../src/migrations.js';

async function main() {
  await runMigrations({
    databaseUrl: config.databaseUrl,
    migrationsDir: path.join(process.cwd(), 'migrations'),
    log: (line) => {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
