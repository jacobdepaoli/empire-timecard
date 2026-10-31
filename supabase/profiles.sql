-- ════════════════════════════════════════════════════════════════════════════
--  Empire Hub: crew profiles + birthday / work-anniversary celebrations
-- ════════════════════════════════════════════════════════════════════════════

-- ── Profile fields each person fills in about themselves ────────────────────
alter table public.employees
  add column nickname      text default '',
  add column birthday      date,
  add column show_birthday boolean not null default true,   -- month/day shown to crew; year never shown
  add column bio           text default '',
  add column hometown      text default '',
  add column favorite_tool text default '',
  add column fun_fact      text default '',
  add column share_phone   boolean not null default false;  -- phone in the crew directory only if opted in

-- Crew may now change their own photo (photo_url left the admin-only list).
create or replace function public.guard_employee_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.email is distinct from old.email or new.is_owner is distinct from old.is_owner or new.id <> old.id then
    raise exception 'Login email and owner status can only be changed by the admin-users function';
  end if;
  if not public.is_admin() then
    if (new.is_admin, new.active, new.role, new.pay_rate, new.gps_required, new.hire_date,
        new.license_number, new.notes, new.qbo_id, new.address, new.city, new.state, new.zip,
        new.emergency_contact, new.emergency_phone)
       is distinct from
       (old.is_admin, old.active, old.role, old.pay_rate, old.gps_required, old.hire_date,
        old.license_number, old.notes, old.qbo_id, old.address, old.city, old.state, old.zip,
        old.emergency_contact, old.emergency_phone) then
      raise exception 'Only admins can change those fields';
    end if;
    if new.must_change_password and not old.must_change_password then
      raise exception 'Not allowed';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_employee_update() from public, anon, authenticated;

-- Crew directory: only the friendly, opt-in fields. No pay, address, or emergency info.
create or replace function public.crew_profiles()
returns table (id uuid, name text, nickname text, role text, photo_url text, bio text, hometown text,
               favorite_tool text, fun_fact text, birthday_md text, hire_date date, phone text, is_admin boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.nickname, e.role, e.photo_url, e.bio, e.hometown, e.favorite_tool, e.fun_fact,
         case when e.show_birthday and e.birthday is not null then to_char(e.birthday, 'MM-DD') end,
         e.hire_date,
         case when e.share_phone then e.phone end,
         e.is_admin
  from public.employees e
  where e.active and not e.is_owner and public.is_active_employee()
  order by e.name
$$;
revoke all on function public.crew_profiles() from public, anon;
grant execute on function public.crew_profiles() to authenticated;

-- Profile photos: each person can upload into their own folder (employee-photos/<their id>/...).
create policy emp_photos_self_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy emp_photos_self_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-photos' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_employee());
create policy emp_photos_self_update on storage.objects for update to authenticated
  using (bucket_id = 'employee-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Celebrations: auto-posted to Announcements on the day ───────────────────
alter table public.announcements
  add column kind text not null default 'post' check (kind in ('post', 'celebration'));

create table public.celebration_posts (
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('birthday', 'anniversary')),
  year integer not null,
  announcement_id uuid references public.announcements(id) on delete set null,
  primary key (employee_id, kind, year)          -- never posts the same one twice
);
alter table public.celebration_posts enable row level security;   -- no policies: only the job writes it
revoke all on public.celebration_posts from anon, authenticated;

create or replace function public.post_celebrations() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  e record; ann uuid; n integer := 0; yrs integer; who text;
  -- Feb 29 birthdays are celebrated Feb 28 in non-leap years
  is_day boolean;
begin
  for e in select * from public.employees where active and not is_owner loop
    who := coalesce(nullif(e.nickname, ''), split_part(e.name, ' ', 1));

    if e.show_birthday and e.birthday is not null then
      is_day := to_char(e.birthday, 'MM-DD') = to_char(d, 'MM-DD')
             or (to_char(e.birthday, 'MM-DD') = '02-29' and to_char(d, 'MM-DD') = '02-28'
                 and not (extract(year from d)::int % 4 = 0 and (extract(year from d)::int % 100 <> 0 or extract(year from d)::int % 400 = 0)));
      if is_day and not exists (select 1 from public.celebration_posts where employee_id = e.id and kind = 'birthday' and year = extract(year from d)) then
        insert into public.announcements (title, body, kind, author_name)
          values ('🎂 Happy Birthday, ' || who || '!',
                  'Today is ' || e.name || '''s birthday. Drop a comment and wish them a great one!',
                  'celebration', 'Empire Hub')
          returning id into ann;
        insert into public.celebration_posts values (e.id, 'birthday', extract(year from d), ann);
        n := n + 1;
      end if;
    end if;

    if e.hire_date is not null and to_char(e.hire_date, 'MM-DD') = to_char(d, 'MM-DD') then
      yrs := extract(year from d)::int - extract(year from e.hire_date)::int;
      if yrs >= 1 and not exists (select 1 from public.celebration_posts where employee_id = e.id and kind = 'anniversary' and year = extract(year from d)) then
        insert into public.announcements (title, body, kind, author_name)
          values ('🎉 ' || yrs || (case when yrs = 1 then ' year' else ' years' end) || ' with the crew, ' || who || '!',
                  e.name || ' started ' || yrs || (case when yrs = 1 then ' year' else ' years' end) || ' ago today. Thank you for all that you do!',
                  'celebration', 'Empire Hub')
          returning id into ann;
        insert into public.celebration_posts values (e.id, 'anniversary', extract(year from d), ann);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.post_celebrations() from public, anon, authenticated;

-- Every day at 14:00 UTC = 7:00 AM Pacific in summer, 6:00 AM in winter.
create extension if not exists pg_cron;
select cron.schedule('empire-daily-celebrations', '0 14 * * *', 'select public.post_celebrations()');
