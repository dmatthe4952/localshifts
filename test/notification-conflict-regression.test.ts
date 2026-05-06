import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { sql } from 'kysely';
import { loadAppForTest } from './helpers/env.js';
import { migrationsDirFromRepoRoot, resetDb, seedBasicEvent } from './helpers/db.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('notification_sends conflict regression', () => {
  let createDb: any;
  let runMigrations: any;
  let createSignup: any;
  let sendSignupConfirmationWithKind: any;

  beforeAll(async () => {
    ({ createDb, runMigrations } = await loadAppForTest({
      APP_ENV: 'test',
      APP_PORT: '3000',
      APP_URL: 'http://localhost:3000',
      APP_TIMEZONE: 'America/New_York',
      DATABASE_URL: DATABASE_URL!,
      SESSION_SECRET: 'test-only-change-me',
      ADMIN_TOKEN: 'test-ops-change-me'
    }));

    ({ createSignup } = await import('../src/public.js'));
    ({ sendSignupConfirmationWithKind } = await import('../src/notifications.js'));

    await runMigrations({
      databaseUrl: DATABASE_URL!,
      migrationsDir: migrationsDirFromRepoRoot()
    });
  });

  let db: any;

  beforeEach(async () => {
    db = createDb();
    await resetDb(db);

    // Reproduce staging-style arbiter: no table unique(kind, signup_id),
    // but a partial unique index for non-reminder rows.
    await sql`alter table notification_sends drop constraint if exists notification_sends_kind_signup_id_key`.execute(db);
    await sql`drop index if exists ux_notification_sends_kind_signup_non_reminder`.execute(db);
    await sql`
      create unique index ux_notification_sends_kind_signup_non_reminder
      on notification_sends (kind, signup_id)
      where kind <> 'reminder'
    `.execute(db);
  });

  test('signup confirmation send-and-record works with partial unique index and dedupes safely', async () => {
    const { shiftId } = await seedBasicEvent(db);

    const created = await createSignup({
      db,
      shiftId,
      firstName: 'Ada',
      lastName: 'L',
      email: 'ada@example.com'
    });

    await expect(sendSignupConfirmationWithKind(db, created.signupId, 'signup_confirmation')).resolves.toBeUndefined();
    await expect(sendSignupConfirmationWithKind(db, created.signupId, 'signup_confirmation')).resolves.toBeUndefined();

    const rows = await db
      .selectFrom('notification_sends')
      .select(['id', 'status'])
      .where('kind', '=', 'signup_confirmation')
      .where('signup_id', '=', created.signupId)
      .execute();

    expect(rows.length).toBe(1);
    expect(['queued', 'sent', 'failed']).toContain(String(rows[0]?.status ?? ''));
  });
});
