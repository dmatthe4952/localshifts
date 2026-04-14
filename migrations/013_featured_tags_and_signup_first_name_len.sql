-- Featured events + tag filtering (public landing page)
alter table events
  add column if not exists is_featured boolean not null default false,
  add column if not exists tags text[] not null default '{}';

-- Backfill featured based on legacy category usage.
update events
  set is_featured = true
  where category = 'featured';

-- Volunteer first-name: reduce to 1 character.
-- Truncate existing data to fit.
update signups
  set first_name = left(trim(first_name), 1)
  where first_name is not null;

alter table signups
  alter column first_name type varchar(1);

