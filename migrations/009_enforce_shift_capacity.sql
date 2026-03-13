-- Enforce shift capacity at the database layer to prevent race-condition overfills.
-- This complements app-level checks by guaranteeing correctness even if multiple
-- requests attempt to create signups concurrently.

create or replace function enforce_shift_capacity()
returns trigger as $$
declare
  max_vol integer;
  filled integer;
begin
  -- Only enforce on active signups (inserts or transitions to active).
  if new.status is distinct from 'active' then
    return new;
  end if;

  -- Lock the shift row so concurrent signups serialize per shift.
  select max_volunteers into max_vol
  from shifts
  where id = new.shift_id
  for update;

  if max_vol is null then
    raise exception 'Shift not found.';
  end if;

  -- Count existing active signups, excluding this row for updates.
  select count(*) into filled
  from signups
  where shift_id = new.shift_id
    and status = 'active'
    and (tg_op = 'INSERT' or id <> new.id);

  if filled >= max_vol then
    raise exception 'Sorry — this shift is full.';
  end if;

  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_signups_enforce_capacity_insert') then
    create trigger trg_signups_enforce_capacity_insert
      before insert on signups
      for each row execute function enforce_shift_capacity();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_signups_enforce_capacity_update') then
    create trigger trg_signups_enforce_capacity_update
      before update of status on signups
      for each row
      when (new.status = 'active' and old.status is distinct from 'active')
      execute function enforce_shift_capacity();
  end if;
end $$;

