-- One-time email link tokens for "My Signups" page.

create table if not exists volunteer_email_tokens (
  id uuid primary key default gen_random_uuid(),
  email varchar(120) not null,
  email_norm text generated always as (lower(email)) stored,
  token_hmac bytea not null,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (token_hmac)
);

create index if not exists idx_volunteer_email_tokens_email_expires
  on volunteer_email_tokens (email_norm, expires_at desc);

