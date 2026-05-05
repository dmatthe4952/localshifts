-- PRD v2.3 final cleanup migration
-- Purpose: remove legacy compatibility columns that may have been restored
-- after 019 was marked applied.

alter table events
  drop column if exists end_date;

alter table signups
  drop column if exists cancel_token;

alter table volunteer_email_tokens
  drop column if exists used_at;
