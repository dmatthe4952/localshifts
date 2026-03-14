import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { loadAppForTest } from './helpers/env.js';
import { migrationsDirFromRepoRoot, resetDb, seedBasicEvent } from './helpers/db.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('ops cancellation', () => {
  let createDb: any;
  let buildApp: any;
  let runMigrations: any;

  beforeAll(async () => {
    ({ createDb, buildApp, runMigrations } = await loadAppForTest({
      APP_ENV: 'test',
      APP_PORT: '3000',
      APP_URL: 'http://localhost:3000',
      APP_TIMEZONE: 'America/New_York',
      DATABASE_URL: DATABASE_URL!,
      SESSION_SECRET: 'test-only-change-me',
      ADMIN_TOKEN: 'test-ops-change-me'
    }));

    await runMigrations({
      databaseUrl: DATABASE_URL!,
      migrationsDir: migrationsDirFromRepoRoot()
    });
  });

  let db: any;
  let app: any;

  beforeEach(async () => {
    db = createDb();
    await resetDb(db);
    app = await buildApp({ db, runMigrations: false, logger: false });
  });

  test('cancelling event blocks signups and sends notifications once', async () => {
    const { eventSlug, shiftId } = await seedBasicEvent(db);

    await app.inject({
      method: 'POST',
      url: `/events/${eventSlug}/shifts/${shiftId}/signup`,
      payload: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }
    });

    const resCancel = await app.inject({
      method: 'POST',
      url: `/ops/events/${eventSlug}/cancel`,
      headers: { 'x-admin-token': 'test-ops-change-me', 'content-type': 'application/json' },
      payload: { message: 'Weather.' }
    });
    expect(resCancel.statusCode).toBe(200);

    const resCancel2 = await app.inject({
      method: 'POST',
      url: `/ops/events/${eventSlug}/cancel`,
      headers: { 'x-admin-token': 'test-ops-change-me', 'content-type': 'application/json' },
      payload: { message: 'Weather.' }
    });
    expect(resCancel2.statusCode).toBe(200);

    const resSignup2 = await app.inject({
      method: 'POST',
      url: `/events/${eventSlug}/shifts/${shiftId}/signup`,
      payload: { firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' }
    });
    expect(resSignup2.statusCode).toBe(303);
    expect(String(resSignup2.headers.location)).toContain('err=');

    const sends = await db
      .selectFrom('notification_sends')
      .where('kind', '=', 'event_cancelled')
      .select((eb: any) => eb.fn.countAll<number>().as('c'))
      .executeTakeFirst();
    expect(Number(sends?.c ?? 0)).toBe(1);
  });
});
