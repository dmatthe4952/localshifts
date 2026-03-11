-- Event cancellation support

alter table events
  add column if not exists cancelled_at timestamptz null,
  add column if not exists cancellation_message text null;

create index if not exists idx_events_cancelled_at
  on events (cancelled_at);

