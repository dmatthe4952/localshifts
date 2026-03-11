-- Track notification sends to prevent duplicates and provide basic audit.

create table if not exists notification_sends (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  event_id uuid null references events(id) on delete cascade,
  signup_id uuid null references signups(id) on delete cascade,
  to_email varchar(120) not null,
  subject text not null,
  body text not null,
  status text not null default 'queued', -- queued|sent|failed
  error text null,
  created_at timestamptz not null default now(),
  sent_at timestamptz null,
  unique (kind, signup_id)
);

create index if not exists idx_notification_sends_created_at
  on notification_sends (created_at desc);

