-- PRD v2.3 prep migration (non-breaking)
-- Safe to apply while v2.2-era code is still running.

-- 1) notification_sends: add reminder_rule_id for reminder-specific dedupe.
alter table notification_sends
  add column if not exists reminder_rule_id uuid null references reminder_rules(id) on delete cascade;

-- Helpful lookup index for scheduler/query paths.
create index if not exists idx_notification_sends_signup_reminder_rule
  on notification_sends (signup_id, reminder_rule_id)
  where reminder_rule_id is not null;

-- Prep unique index for reminder dedupe without removing legacy unique yet.
-- NOTE: legacy unique(kind, signup_id) remains in place until cleanup migration.
create unique index if not exists ux_notification_sends_signup_reminder_rule
  on notification_sends (signup_id, reminder_rule_id)
  where reminder_rule_id is not null;

-- 2) signups: add cancel_token_hash field for v2.3 naming alignment.
-- Keep legacy columns for compatibility during code transition.
alter table signups
  add column if not exists cancel_token_hash varchar(64) null;

-- Backfill cancel_token_hash from existing raw token when present.
-- This uses sha256(token) hex so field semantics are hash-only.
update signups
set cancel_token_hash = encode(digest(cancel_token, 'sha256'), 'hex')
where cancel_token is not null
  and cancel_token_hash is null;

create unique index if not exists ux_signups_cancel_token_hash
  on signups (cancel_token_hash)
  where cancel_token_hash is not null;

-- 3) volunteer_email_tokens: first_used_at audit field (non-invalidating semantics).
alter table volunteer_email_tokens
  add column if not exists first_used_at timestamptz null;

update volunteer_email_tokens
set first_used_at = used_at
where used_at is not null
  and first_used_at is null;

-- 4) events recurring model deprecation prep.
-- No destructive changes yet; keep v2.2 fields intact until code cutover.
-- Add an explicit marker setting for operator visibility.
insert into system_settings (key, value_encrypted)
values ('PRD_V23_PREP_APPLIED', convert_to('true', 'UTF8'))
on conflict (key) do nothing;
