-- Volunteer last name: reduce to 1 character (initial).
-- Truncate existing data to fit.
update signups
  set last_name = left(trim(last_name), 1)
  where last_name is not null;

alter table signups
  alter column last_name type varchar(1);

-- Volunteer first name: allow full first name again (up to 80 chars).
alter table signups
  alter column first_name type varchar(80);

