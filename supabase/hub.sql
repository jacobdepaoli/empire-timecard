-- ════════════════════════════════════════════════════════════════════════════
--  Empire Hub: Announcements + Resources (runs after schema.sql)
-- ════════════════════════════════════════════════════════════════════════════

-- ── Announcements (admins post; everyone confirms and comments) ─────────────
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  author_id uuid references public.employees(id) on delete set null,
  author_name text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index announcements_feed_idx on public.announcements (pinned desc, created_at desc);

-- "Got it" confirmations: one row per person per announcement.
create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

create table public.announcement_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  author_id uuid references public.employees(id) on delete set null,
  author_name text default '',
  body text not null,
  created_at timestamptz default now()
);
create index announcement_comments_idx on public.announcement_comments (announcement_id, created_at);

alter table public.announcements         enable row level security;
alter table public.announcement_reads    enable row level security;
alter table public.announcement_comments enable row level security;
revoke all on public.announcements, public.announcement_reads, public.announcement_comments from anon;

create policy ann_select on public.announcements for select to authenticated using (public.is_active_employee());
create policy ann_admin  on public.announcements for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- You can see and add your own confirmation; admins see everyone's.
create policy ann_reads_select on public.announcement_reads for select to authenticated
  using ((employee_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy ann_reads_insert on public.announcement_reads for insert to authenticated
  with check (employee_id = auth.uid() and public.is_active_employee());
create policy ann_reads_admin_delete on public.announcement_reads for delete to authenticated using (public.is_admin());

create policy ann_comments_select on public.announcement_comments for select to authenticated using (public.is_active_employee());
create policy ann_comments_insert on public.announcement_comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_employee());
create policy ann_comments_delete on public.announcement_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ── Resources (admins add files and links; everyone active can view) ────────
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'General',
  title text not null,
  description text default '',
  kind text not null check (kind in ('file', 'link')),
  url text default '',            -- links
  file_path text default '',      -- files: path inside the private "resources" bucket
  file_name text default '',
  file_size bigint default 0,
  sort integer default 0,
  created_by uuid references public.employees(id) on delete set null,
  created_by_name text default '',
  created_at timestamptz default now()
);
create index resources_category_idx on public.resources (category, sort, title);

alter table public.resources enable row level security;
revoke all on public.resources from anon;
create policy resources_select on public.resources for select to authenticated using (public.is_active_employee());
create policy resources_admin  on public.resources for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Private bucket: files open through short-lived signed links for signed-in crew only.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('resources', 'resources', false, 52428800)   -- 50 MB per file
  on conflict (id) do nothing;
create policy resources_files_read on storage.objects for select to authenticated
  using (bucket_id = 'resources' and public.is_active_employee());
create policy resources_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and public.is_admin());
create policy resources_files_update on storage.objects for update to authenticated
  using (bucket_id = 'resources' and public.is_admin());
create policy resources_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resources' and public.is_admin());

-- Live updates for the home-screen badge and comment threads.
alter publication supabase_realtime add table public.announcements, public.announcement_comments;

-- Starter resource: the offline backup T&M form hosted with the app.
insert into public.resources (category, title, description, kind, url, sort)
values ('Forms & SOPs', 'Backup T&M Form (offline)',
        'Use only if the app is down. Prints or emails a work order but does not save it. Send the PDF to the office.',
        'link', '/tm-form.html', 99);

-- ── Job progress feed (anyone posts notes/photos; comments + likes) ─────────
create table public.job_updates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  author_id uuid references public.employees(id) on delete set null,
  author_name text default '',
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,   -- [{ path, w, h }] in the private "job-photos" bucket
  created_at timestamptz default now(),
  edited_at timestamptz
);
create index job_updates_feed_idx on public.job_updates (job_id, created_at desc);

create table public.job_update_likes (
  update_id uuid not null references public.job_updates(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (update_id, employee_id)
);

create table public.job_update_comments (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.job_updates(id) on delete cascade,
  author_id uuid references public.employees(id) on delete set null,
  author_name text default '',
  body text not null,
  created_at timestamptz default now()
);
create index job_update_comments_idx on public.job_update_comments (update_id, created_at);

alter table public.job_updates         enable row level security;
alter table public.job_update_likes    enable row level security;
alter table public.job_update_comments enable row level security;
revoke all on public.job_updates, public.job_update_likes, public.job_update_comments from anon;

create policy ju_select on public.job_updates for select to authenticated using (public.is_active_employee());
create policy ju_insert on public.job_updates for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_employee());
create policy ju_update on public.job_updates for update to authenticated
  using ((author_id = auth.uid() and public.is_active_employee()) or public.is_admin())
  with check ((author_id = auth.uid() and public.is_active_employee()) or public.is_admin());
create policy ju_delete on public.job_updates for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create policy jul_select on public.job_update_likes for select to authenticated using (public.is_active_employee());
create policy jul_insert on public.job_update_likes for insert to authenticated
  with check (employee_id = auth.uid() and public.is_active_employee());
create policy jul_delete on public.job_update_likes for delete to authenticated using (employee_id = auth.uid());

create policy juc_select on public.job_update_comments for select to authenticated using (public.is_active_employee());
create policy juc_insert on public.job_update_comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_employee());
create policy juc_delete on public.job_update_comments for delete to authenticated using (author_id = auth.uid() or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('job-photos', 'job-photos', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do nothing;
create policy job_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and public.is_active_employee());
create policy job_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and public.is_active_employee());
create policy job_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-photos' and (owner_id = auth.uid()::text or public.is_admin()));

alter publication supabase_realtime add table public.job_updates, public.job_update_comments, public.job_update_likes;
