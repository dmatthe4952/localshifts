-- Add event slug for public URLs

alter table events
  add column if not exists slug varchar(200) null;

create unique index if not exists ux_events_slug
  on events (slug)
  where slug is not null;

