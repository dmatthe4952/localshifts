import { sql } from 'kysely';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  const dryRun = hasFlag('--dry-run');

  const db = createDb();
  try {
    const eligible = await db
      .selectFrom('events')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('is_archived', '=', false)
      .where(sql<boolean>`start_date < current_date`)
      .executeTakeFirst();

    const count = Number(eligible?.c ?? 0);
    if (dryRun) {
      // eslint-disable-next-line no-console
      console.log(`[archive-events] dry-run: would archive ${count} event(s)`);
      return;
    }

    await db
      .updateTable('events')
      .set({ is_archived: true, updated_at: sql`now()` })
      .where('is_archived', '=', false)
      .where(sql<boolean>`start_date < current_date`)
      .execute();

    // eslint-disable-next-line no-console
    console.log(`[archive-events] archived ${count} event(s) (env=${config.env})`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
