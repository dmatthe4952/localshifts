import { createDb } from '../src/db.js';
import { sendUpcomingShiftReminders } from '../src/notifications.js';

function readArg(name: string): string | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return typeof args[idx + 1] === 'string' ? args[idx + 1] : '';
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function main() {
  const offsetHoursRaw = readArg('--offset-hours') ?? readArg('-o');
  if (!offsetHoursRaw) throw new Error('Usage: node scripts/run.mjs send-reminders --offset-hours <n> [--dry-run] [--limit <n>]');
  const offsetHours = Number(offsetHoursRaw);
  const limitRaw = readArg('--limit');
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const dryRun = hasFlag('--dry-run');

  const db = createDb();
  try {
    const res = await sendUpcomingShiftReminders({ db, offsetHours, dryRun, limit });
    // eslint-disable-next-line no-console
    console.log(
      `[send-reminders] kind=${res.kind} considered=${res.considered} ${dryRun ? `wouldSend=${res.wouldSend}` : `skippedAlreadySent=${res.skippedAlreadySent}`}`
    );
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

