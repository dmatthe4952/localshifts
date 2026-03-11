import { config } from '../src/config.js';
import { createDb } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { sql } from 'kysely';

async function main() {
  if (config.env !== 'development' && config.env !== 'test') {
    throw new Error('set-password is only allowed in development/test.');
  }

  const email = process.argv[2];
  const password = process.argv[3];
  if (!email || !password) {
    throw new Error('Usage: npm run set-password -- <email> <newPassword>');
  }

  const db = createDb();
  try {
    const emailNorm = email.trim().toLowerCase();
    const res = await db
      .updateTable('users')
      .set({ password_hash: hashPassword(password) })
      .where(sql<boolean>`email_norm = ${emailNorm}`)
      .execute();

    const found = await db
      .selectFrom('users')
      .select(['id'])
      .where(sql<boolean>`email_norm = ${emailNorm}`)
      .executeTakeFirst();

    if (!found) throw new Error(`No user found for email: ${email}`);
    // eslint-disable-next-line no-console
    console.log(`Updated password for ${email}`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
