-- Ensure events.slug has a non-partial unique index so ON CONFLICT (slug) works.

drop index if exists ux_events_slug;

create unique index if not exists ux_events_slug
  on events (slug);

