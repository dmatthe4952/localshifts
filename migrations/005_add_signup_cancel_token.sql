-- Store raw cancel token (PRD v1.0) so we can render cancel links on pages.
-- Existing rows may have null cancel_token; cancellation by token continues to work via cancel_token_hmac fallback.

alter table signups
  add column if not exists cancel_token varchar(64) null;

create unique index if not exists ux_signups_cancel_token
  on signups (cancel_token);

