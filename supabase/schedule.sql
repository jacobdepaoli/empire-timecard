-- ════════════════════════════════════════════════════════════════════════════
--  Empire Hub: time-off requests, crew schedule, holidays
-- ════════════════════════════════════════════════════════════════════════════

-- ── Time off ────────────────────────────────────────────────────────────────
create table public.pto_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  employee_name text not null,
  start_date date not null,
  end_date date not null,
  kind text not null default 'PTO' check (kind in ('PTO', 'Sick', 'Unpaid', 'Other')),
  all_day boolean not null default true,
  hours numeric,                                    -- partial day
  note text default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Denied', 'Cancelled')),
  reviewed_by text default '',
  reviewed_at timestamptz,
  review_note text default '',
  created_at timestamptz default now(),
  check (end_date >= start_date)
);
create index pto_requests_dates_idx on public.pto_requests (start_date, end_date);

alter table public.pto_requests enable row level security;
revoke all on public.pto_requests from anon;
create policy pto_select on public.pto_requests for select to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
-- Crew can only file a pending request for themselves...
create policy pto_insert on public.pto_requests for insert to authenticated
  with check ((employee_id = auth.uid() and public.is_active_employee() and status = 'Pending' and reviewed_at is null) or public.is_admin());
-- ...and edit or cancel it while it's still pending. Only admins approve or deny.
create policy pto_update on public.pto_requests for update to authenticated
  using ((employee_id = auth.uid() and status = 'Pending') or public.is_admin())
  with check ((employee_id = auth.uid() and status in ('Pending', 'Cancelled') and reviewed_at is null) or public.is_admin());
create policy pto_delete on public.pto_requests for delete to authenticated using (public.is_admin());

-- Everyone can see who is out (approved only). No reason, type, or notes.
create or replace function public.time_off_between(p_from date, p_to date)
returns table (employee_id uuid, employee_name text, start_date date, end_date date, all_day boolean, hours numeric)
language sql stable security definer set search_path = '' as $$
  select r.employee_id, r.employee_name, r.start_date, r.end_date, r.all_day, r.hours
  from public.pto_requests r
  where r.status = 'Approved' and r.start_date <= p_to and r.end_date >= p_from and public.is_active_employee()
$$;
revoke all on function public.time_off_between(date, date) from public, anon;
grant execute on function public.time_off_between(date, date) to authenticated;

-- ── Schedule: who works where, by day ───────────────────────────────────────
create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  employee_id uuid not null references public.employees(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  label text default '',                 -- for non-job days: Shop, Training, Supply run…
  start_time time,
  end_time time,
  notes text default '',
  created_by text default '',
  created_at timestamptz default now()
);
create index schedule_entries_date_idx on public.schedule_entries (work_date, employee_id);

alter table public.schedule_entries enable row level security;
revoke all on public.schedule_entries from anon;
create policy sched_select on public.schedule_entries for select to authenticated using (public.is_active_employee());
create policy sched_admin  on public.schedule_entries for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Company holidays (shown on the schedule; admins edit) ───────────────────
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null
);
alter table public.holidays enable row level security;
revoke all on public.holidays from anon;
create policy holidays_select on public.holidays for select to authenticated using (public.is_active_employee());
create policy holidays_admin  on public.holidays for all    to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.holidays (date, name) values
  ('2026-11-26', 'Thanksgiving'), ('2026-11-27', 'Day after Thanksgiving'), ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day'), ('2027-05-31', 'Memorial Day'), ('2027-07-05', 'Independence Day (observed)'),
  ('2027-09-06', 'Labor Day'), ('2027-11-25', 'Thanksgiving'), ('2027-11-26', 'Day after Thanksgiving'), ('2027-12-24', 'Christmas Day (observed)');

alter publication supabase_realtime add table public.pto_requests, public.schedule_entries;
