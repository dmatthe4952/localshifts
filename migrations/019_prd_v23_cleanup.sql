-- PRD v2.3 cleanup migration (post-cutover)
-- This migration is intentionally gated. It only executes when
-- system_settings.PRD_V23_CLEANUP_READY = 'true'.

-- To enable cleanup intentionally:
--   upsert system_settings key 'PRD_V23_CLEANUP_READY' with plaintext 'true'
--   (respecting your app's settings encryption flow if applicable), then rerun migrate.

-- Local helper flag lookup.
do $$
declare
  cleanup_ready boolean := false;
begin
  select coalesce(convert_from(value_encrypted, 'UTF8') = 'true', false)
    into cleanup_ready
  from system_settings
  where key = 'PRD_V23_CLEANUP_READY';

  if not cleanup_ready then
    raise notice 'PRD v2.3 cleanup skipped: PRD_V23_CLEANUP_READY is not true';
    return;
  end if;

  -- 1) notification_sends dedupe finalization.
  -- Drop legacy unique(kind, signup_id) that blocks multiple reminder offsets.
  alter table notification_sends
    drop constraint if exists notification_sends_kind_signup_id_key;

  -- Recreate non-reminder dedupe preserving v2.3 behavior.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'notification_sends'
      and indexname = 'ux_notification_sends_kind_signup_non_reminder'
  ) then
    execute $sql$
      create unique index ux_notification_sends_kind_signup_non_reminder
        on notification_sends (kind, signup_id)
      where kind <> 'reminder'
    $sql$;
  end if;

  -- Enforce reminder_rule_id for reminder rows after code is migrated.
  update notification_sends
  set reminder_rule_id = null
  where kind <> 'reminder' and reminder_rule_id is not null;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_notification_sends_reminder_rule_required'
  ) then
    alter table notification_sends
      add constraint chk_notification_sends_reminder_rule_required
      check (kind <> 'reminder' or reminder_rule_id is not null);
  end if;

  -- 2) signups token cleanup.
  -- Remove legacy raw token column and old index after app no longer depends on them.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'signups'
      and indexname = 'ux_signups_cancel_token'
  ) then
    execute 'drop index public.ux_signups_cancel_token';
  end if;

  alter table signups
    drop column if exists cancel_token;

  -- Tighten cancel_token_hash only after old paths are removed.
  -- Keep nullable if you still have historical rows that should remain uncancelable.

  -- 3) volunteer_email_tokens field rename finalization.
  alter table volunteer_email_tokens
    drop column if exists used_at;

  -- 4) recurring event schema removal from V1 model.
  alter table events
    drop constraint if exists chk_event_dates;

  alter table events
    drop column if exists recurrence_rule,
    drop column if exists event_type,
    drop column if exists end_date;

  -- Drop enum type if now unused.
  if exists (
    select 1
    from pg_type t
    where t.typname = 'event_type'
      and not exists (
        select 1
        from pg_depend d
        join pg_class c on c.oid = d.refobjid
        where d.objid = t.oid
          and c.relkind in ('r','v','m','f','p')
      )
  ) then
    drop type event_type;
  end if;

  -- Mark completion.
  insert into system_settings (key, value_encrypted)
  values ('PRD_V23_CLEANUP_APPLIED', convert_to('true', 'UTF8'))
  on conflict (key) do update set value_encrypted = excluded.value_encrypted;
end $$;
