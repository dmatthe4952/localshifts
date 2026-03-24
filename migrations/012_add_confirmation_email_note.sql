alter table events
  add column if not exists confirmation_email_note text null;

