import type { Kysely } from 'kysely';
import { config } from './config.js';
import type { DB } from './db.js';
import { sendEmail } from './email.js';

function safeIso(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value ?? '') : d.toISOString();
}

async function sendAndRecord(params: {
  db: Kysely<DB>;
  kind: string;
  eventId: string | null;
  signupId: string | null;
  toEmail: string;
  subject: string;
  body: string;
}) {
  const inserted = await params.db
    .insertInto('notification_sends')
    .values({
      kind: params.kind,
      event_id: params.eventId,
      signup_id: params.signupId,
      to_email: params.toEmail,
      subject: params.subject,
      body: params.body,
      status: 'queued'
    })
    .onConflict((oc) => oc.columns(['kind', 'signup_id']).doNothing())
    .returning(['id'])
    .executeTakeFirst();

  if (!inserted) return { skipped: true as const };

  try {
    await sendEmail({ to: params.toEmail, subject: params.subject, text: params.body });
    await params.db
      .updateTable('notification_sends')
      .set({ status: 'sent', sent_at: new Date().toISOString(), error: null })
      .where('id', '=', inserted.id)
      .execute();
    return { skipped: false as const };
  } catch (err: any) {
    await params.db
      .updateTable('notification_sends')
      .set({ status: 'failed', error: String(err?.message ?? err) })
      .where('id', '=', inserted.id)
      .execute();
    return { skipped: false as const };
  }
}

export async function sendSignupConfirmation(db: Kysely<DB>, signupId: string) {
  const row = await db
    .selectFrom('signups')
    .innerJoin('shifts', 'shifts.id', 'signups.shift_id')
    .innerJoin('events', 'events.id', 'shifts.event_id')
    .innerJoin('organizations', 'organizations.id', 'events.organization_id')
    .select([
      'signups.id as signup_id',
      'signups.first_name',
      'signups.email',
      'signups.cancel_token',
      'events.id as event_id',
      'events.title as event_title',
      'organizations.name as organization_name',
      'shifts.role_name',
      'shifts.shift_date',
      'shifts.start_time',
      'shifts.end_time',
      'events.location_name',
      'events.location_map_url'
    ])
    .where('signups.id', '=', signupId)
    .executeTakeFirst();

  if (!row) return;
  if (!row.cancel_token) return;

  const cancelUrl = `${config.appUrl}/cancel/${encodeURIComponent(row.cancel_token)}`;
  const subject = `Signup confirmed: ${row.event_title}`;
  const body = [
    `Hi ${row.first_name},`,
    '',
    `You’re signed up for:`,
    `${row.event_title} (${row.organization_name})`,
    `Shift: ${row.role_name}`,
    `When: ${String(row.shift_date)} ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`,
    row.location_name ? `Where: ${row.location_name}` : '',
    row.location_map_url ? `Map: ${row.location_map_url}` : '',
    '',
    `Cancel your signup: ${cancelUrl}`,
    '',
    `— VolunteerFlow`
  ]
    .filter(Boolean)
    .join('\n');

  await sendAndRecord({
    db,
    kind: 'signup_confirmation',
    eventId: row.event_id,
    signupId: row.signup_id,
    toEmail: row.email,
    subject,
    body
  });
}

export async function sendCancellationEmails(db: Kysely<DB>, signupId: string, cancelledAt: string) {
  const row = await db
    .selectFrom('signups')
    .innerJoin('shifts', 'shifts.id', 'signups.shift_id')
    .innerJoin('events', 'events.id', 'shifts.event_id')
    .innerJoin('organizations', 'organizations.id', 'events.organization_id')
    .innerJoin('users', 'users.id', 'events.manager_id')
    .select([
      'signups.id as signup_id',
      'signups.first_name',
      'signups.last_name',
      'signups.email',
      'signups.cancellation_note',
      'events.id as event_id',
      'events.title as event_title',
      'organizations.name as organization_name',
      'users.email as manager_email',
      'users.display_name as manager_name',
      'shifts.role_name',
      'shifts.shift_date',
      'shifts.start_time',
      'shifts.end_time'
    ])
    .where('signups.id', '=', signupId)
    .executeTakeFirst();

  if (!row) return;

  const when = `${String(row.shift_date)} ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`;
  const canceledIso = safeIso(cancelledAt);

  await sendAndRecord({
    db,
    kind: 'cancellation_confirmation',
    eventId: row.event_id,
    signupId: row.signup_id,
    toEmail: row.email,
    subject: `Cancellation confirmed: ${row.event_title}`,
    body: [
      `Hi ${row.first_name},`,
      '',
      `Your signup has been cancelled:`,
      `${row.event_title} (${row.organization_name})`,
      `Shift: ${row.role_name}`,
      `When: ${when}`,
      '',
      `Cancelled at: ${canceledIso}`,
      '',
      `— VolunteerFlow`
    ].join('\n')
  });

  const note = row.cancellation_note ? `Note: ${row.cancellation_note}` : '';
  await sendAndRecord({
    db,
    kind: 'cancellation_alert_manager',
    eventId: row.event_id,
    signupId: row.signup_id,
    toEmail: row.manager_email,
    subject: `[CANCELLED] ${row.event_title} — ${row.role_name}`,
    body: [
      `Hello ${row.manager_name},`,
      '',
      `A volunteer cancelled their signup:`,
      `${row.first_name} ${row.last_name} <${row.email}>`,
      '',
      `Event: ${row.event_title} (${row.organization_name})`,
      `Shift: ${row.role_name}`,
      `When: ${when}`,
      '',
      note,
      '',
      `— VolunteerFlow`
    ]
      .filter(Boolean)
      .join('\n')
  });
}

export async function sendManagerRemovalNotice(db: Kysely<DB>, signupId: string) {
  const row = await db
    .selectFrom('signups')
    .innerJoin('shifts', 'shifts.id', 'signups.shift_id')
    .innerJoin('events', 'events.id', 'shifts.event_id')
    .innerJoin('organizations', 'organizations.id', 'events.organization_id')
    .select([
      'signups.id as signup_id',
      'signups.first_name',
      'signups.email',
      'events.id as event_id',
      'events.title as event_title',
      'organizations.name as organization_name',
      'shifts.role_name',
      'shifts.shift_date',
      'shifts.start_time',
      'shifts.end_time'
    ])
    .where('signups.id', '=', signupId)
    .executeTakeFirst();

  if (!row) return;
  const when = `${String(row.shift_date)} ${String(row.start_time).slice(0, 5)}–${String(row.end_time).slice(0, 5)}`;
  await sendAndRecord({
    db,
    kind: 'manager_removal_notice',
    eventId: row.event_id,
    signupId: row.signup_id,
    toEmail: row.email,
    subject: `Removed from shift: ${row.event_title}`,
    body: [
      `Hi ${row.first_name},`,
      '',
      `An organizer removed your signup:`,
      `${row.event_title} (${row.organization_name})`,
      `Shift: ${row.role_name}`,
      `When: ${when}`,
      '',
      `If you think this is a mistake, reply to the organizer.`,
      '',
      `— VolunteerFlow`
    ].join('\n')
  });
}

