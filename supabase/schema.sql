-- ════════════════════════════════════════════════════════════════════════════
--  Empire TimeCard: Supabase database schema
--
--  Security model
--  • Login uses Supabase Auth. employees.id = auth.users.id.
--  • The anon (signed-out) role has no access to any table.
--  • Field crew read/write only their own time, timecards, and T&M sheets.
--  • Admins (is_admin) read/write everything. The owner account (is_owner) is
--    an admin that is hidden from crew lists and never clocks in.
--  • Creating logins, resetting passwords, and changing login emails happen
--    in the `admin-users` Edge Function (service role), never in the browser.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ──────────────────────────────────────────────────────────────────
create table public.employees (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text default '',
  role text default 'Apprentice',            -- job title shown in the app
  is_admin boolean not null default false,
  is_owner boolean not null default false,   -- hidden "ghost" owner account
  active boolean not null default true,
  must_change_password boolean not null default true,
  pay_rate numeric default 0,
  gps_required boolean default true,
  photo_url text default '',
  address text default '', city text default '', state text default '', zip text default '',
  emergency_contact text default '', emergency_phone text default '',
  hire_date date,
  license_number text default '',
  notes text default '',
  qbo_id text,
  created_at timestamptz default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text default '', address text default '', city text default '', state text default '',
  phone text default '', email text default '', notes text default '',
  created_at timestamptz default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text default '', address text default '',
  status text default 'Active',
  notes text default '',
  color text default '#4AA04A',
  address_required boolean default false,
  is_service boolean default false,
  customer_id uuid references public.customers(id) on delete set null,
  progress_notes text default '',
  qbo_id text, qbo_synced_at timestamptz,
  created_at timestamptz default now()
);

create table public.time_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  job_id uuid references public.jobs(id) on delete set null,
  job_name text not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  notes text default '',
  site_address text default '', customer_name text default '',
  is_service boolean default false,
  location_in_lat text, location_in_lng text, location_in_accuracy integer,
  location_out_lat text, location_out_lng text, location_out_accuracy integer,
  location_cur_lat text, location_cur_lng text, location_cur_at timestamptz,
  qbo_id text, qbo_synced_at timestamptz,
  created_at timestamptz default now()
);
create index time_logs_employee_idx on public.time_logs (employee_id, clock_in desc);
create index time_logs_open_idx on public.time_logs (job_id) where clock_out is null;

create table public.timecards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  employee_name text not null,
  week_start date not null,
  total_hours numeric default 0,
  entries jsonb default '[]'::jsonb,
  status text default 'Submitted',
  signature text default '',
  submitted_at timestamptz default now(),
  approved_by text default '', approved_at timestamptz,
  created_at timestamptz default now(),
  unique (employee_id, week_start)
);

create table public.tm_sheets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  job_name text,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text,
  work_date date not null,
  tm_number text default '',                 -- Job / Invoice # (EENV…)
  site_address text default '', customer_name text default '',
  customer_phone text default '', customer_email text default '',
  description text default '',
  complaint text default '', work_performed text default '', resolution text default '',
  labor jsonb default '[]'::jsonb, labor_breakdown jsonb default '[]'::jsonb,
  labor_hours numeric default 0, labor_rate numeric default 0,
  materials jsonb default '[]'::jsonb,
  photos jsonb default '[]'::jsonb, photo_urls jsonb default '[]'::jsonb,
  markup_rate numeric default 30, tax_rate numeric default 8.265,
  total_labor numeric default 0, total_materials numeric default 0,
  labor_total numeric default 0, materials_total numeric default 0, materials_markup numeric default 0,
  tax_amount numeric default 0, grand_total numeric default 0,
  tech_signature text default '', customer_signature text default '',
  customer_sign_name text default '', sign_date date,
  status text default 'Draft',
  created_at timestamptz default now()
);

create table public.photo_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null, job_name text,
  employee_id uuid references public.employees(id) on delete set null, employee_name text,
  notes text default '',
  photo_urls text[] default '{}',
  created_at timestamptz default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  author_id uuid references public.employees(id) on delete set null,
  author_name text default '',
  body text default '',
  photo_urls jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
create index notes_entity_idx on public.notes (entity_type, entity_id, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- QuickBooks (future sync). Tokens are never readable from the browser.
create table public.qbo_connection (
  id integer primary key default 1,
  realm_id text, access_token text, refresh_token text, expires_at timestamptz,
  connected_by text, updated_at timestamptz default now()
);
create table public.qbo_sync_log (
  id uuid primary key default gen_random_uuid(),
  direction text, entity text, ref text, status text, detail text,
  created_at timestamptz default now()
);

-- ── Helper functions (used by policies) ─────────────────────────────────────
create or replace function public.is_active_employee() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees where id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.employees where id = auth.uid() and active and is_admin)
$$;

-- Names/titles for pickers (T&M labor rows). No pay, contact, or address data.
create or replace function public.crew_directory()
returns table (id uuid, name text, role text, photo_url text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.role, e.photo_url
  from public.employees e
  where e.active and not e.is_owner and public.is_active_employee()
  order by e.name
$$;

-- Who is clocked in on a job right now (pre-fills T&M labor at clock-out).
create or replace function public.active_crew_on_job(p_job_id uuid)
returns table (employee_name text, clock_in timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.employee_name, t.clock_in
  from public.time_logs t
  where t.job_id = p_job_id and t.clock_out is null and public.is_active_employee()
$$;

revoke all on function public.is_active_employee(), public.is_admin(), public.crew_directory(), public.active_crew_on_job(uuid) from public, anon;
grant execute on function public.is_active_employee(), public.is_admin(), public.crew_directory(), public.active_crew_on_job(uuid) to authenticated;

-- ── Guard triggers: field crew can't edit payroll-sensitive fields ──────────
-- auth.uid() is null for the service role (Edge Function / SQL editor), which
-- is allowed to change anything.
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
        new.emergency_contact, new.emergency_phone, new.photo_url)
       is distinct from
       (old.is_admin, old.active, old.role, old.pay_rate, old.gps_required, old.hire_date,
        old.license_number, old.notes, old.qbo_id, old.address, old.city, old.state, old.zip,
        old.emergency_contact, old.emergency_phone, old.photo_url) then
      raise exception 'Only admins can change those fields';
    end if;
    if new.must_change_password and not old.must_change_password then
      raise exception 'Not allowed';
    end if;
  end if;
  return new;
end $$;
create trigger employees_guard before update on public.employees
  for each row execute function public.guard_employee_update();

-- Field crew may only close their own open shift and update location / notes.
create or replace function public.guard_time_log_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if (new.employee_id, new.employee_name, new.job_id, new.job_name, new.clock_in,
      new.site_address, new.customer_name, new.is_service,
      new.location_in_lat, new.location_in_lng, new.location_in_accuracy)
     is distinct from
     (old.employee_id, old.employee_name, old.job_id, old.job_name, old.clock_in,
      old.site_address, old.customer_name, old.is_service,
      old.location_in_lat, old.location_in_lng, old.location_in_accuracy) then
    raise exception 'Only admins can edit a time entry';
  end if;
  if old.clock_out is not null and new.clock_out is distinct from old.clock_out then
    raise exception 'This shift is already closed';
  end if;
  return new;
end $$;
create trigger time_logs_guard before update on public.time_logs
  for each row execute function public.guard_time_log_update();

-- Trigger functions fire on their own; nobody should call them directly.
revoke all on function public.guard_employee_update(), public.guard_time_log_update() from public, anon, authenticated;

-- ── Row Level Security ──────────────────────────────────────────────────────
alter table public.employees      enable row level security;
alter table public.customers      enable row level security;
alter table public.jobs           enable row level security;
alter table public.time_logs      enable row level security;
alter table public.timecards      enable row level security;
alter table public.tm_sheets      enable row level security;
alter table public.photo_reports  enable row level security;
alter table public.notes          enable row level security;
alter table public.notifications  enable row level security;
alter table public.qbo_connection enable row level security;  -- no policies: browser can't read tokens
alter table public.qbo_sync_log   enable row level security;

-- Signed-out visitors get nothing.
revoke all on all tables in schema public from anon;

-- employees: you see yourself; admins see everyone. Rows are created/deleted by the Edge Function.
create policy employees_select on public.employees for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy employees_update on public.employees for update to authenticated
  using ((id = auth.uid() and public.is_active_employee()) or public.is_admin())
  with check ((id = auth.uid() and public.is_active_employee()) or public.is_admin());

-- jobs / customers: everyone active can read; admins write.
create policy jobs_select on public.jobs for select to authenticated using (public.is_active_employee());
create policy jobs_write on public.jobs for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy customers_select on public.customers for select to authenticated using (public.is_active_employee());
create policy customers_write on public.customers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- time_logs: own rows or admin.
create policy time_logs_select on public.time_logs for select to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy time_logs_insert on public.time_logs for insert to authenticated
  with check ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy time_logs_update on public.time_logs for update to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin())
  with check ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy time_logs_delete on public.time_logs for delete to authenticated using (public.is_admin());

-- timecards: crew submits/re-signs their own unapproved week; admins approve.
create policy timecards_select on public.timecards for select to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy timecards_insert on public.timecards for insert to authenticated
  with check ((employee_id = auth.uid() and public.is_active_employee() and status = 'Submitted' and approved_at is null) or public.is_admin());
create policy timecards_update on public.timecards for update to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee() and status = 'Submitted') or public.is_admin())
  with check ((employee_id = auth.uid() and public.is_active_employee() and status = 'Submitted' and approved_at is null) or public.is_admin());
create policy timecards_delete on public.timecards for delete to authenticated using (public.is_admin());

-- tm_sheets / photo_reports: crew creates and reads their own; admins manage all.
create policy tm_select on public.tm_sheets for select to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy tm_insert on public.tm_sheets for insert to authenticated
  with check ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy tm_update on public.tm_sheets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tm_delete on public.tm_sheets for delete to authenticated using (public.is_admin());

create policy photo_reports_select on public.photo_reports for select to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy photo_reports_insert on public.photo_reports for insert to authenticated
  with check ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy photo_reports_admin on public.photo_reports for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- notes: shared job/customer notes; you post as yourself.
create policy notes_select on public.notes for select to authenticated using (public.is_active_employee());
create policy notes_insert on public.notes for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_employee());
create policy notes_delete on public.notes for delete to authenticated using (author_id = auth.uid() or public.is_admin());

-- notifications: shared activity feed; only admins clear it.
create policy notifications_select on public.notifications for select to authenticated using (public.is_active_employee());
create policy notifications_insert on public.notifications for insert to authenticated with check (public.is_active_employee());
create policy notifications_update on public.notifications for update to authenticated using (public.is_active_employee()) with check (public.is_active_employee());
create policy notifications_delete on public.notifications for delete to authenticated using (public.is_admin());

create policy qbo_sync_log_select on public.qbo_sync_log for select to authenticated using (public.is_admin());

-- ── Realtime (live notification badge) ──────────────────────────────────────
alter publication supabase_realtime add table public.notifications;

-- ── Storage: employee photos (public read; admins upload) ───────────────────
insert into storage.buckets (id, name, public) values ('employee-photos', 'employee-photos', true)
  on conflict (id) do nothing;
create policy emp_photos_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos' and public.is_admin());   -- needed for upsert
create policy emp_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-photos' and public.is_admin());
create policy emp_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'employee-photos' and public.is_admin());
create policy emp_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-photos' and public.is_admin());

-- ─── 2026-11-12: super admin (migration super_admin_login_management) ────────
-- employees.is_super (Jacob only). public.is_super(). Guard trigger: email/is_owner/is_super/id change only via
-- the admin-users function (service role); is_admin and active change only by the super admin.
-- admin-users function is super-admin-only: list, create, reset_password, update_email, set_access (ban/unban), set_admin.
-- UI: Users & Logins tile (registry superOnly); TimeCard → Team login controls shown to the super admin only.
