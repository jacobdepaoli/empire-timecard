-- ════════════════════════════════════════════════════════════════════════════
--  Empire Hub: Messages (crew channels + direct messages)
-- ════════════════════════════════════════════════════════════════════════════
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('channel', 'dm')),
  name text default '',                 -- channels only
  topic text default '',
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz default now(),
  last_message_at timestamptz default now()
);

-- Who's in a DM, plus everyone's read position (channels get a row the first time someone opens them).
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  last_read_at timestamptz not null default 'epoch',
  primary key (conversation_id, employee_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author_id uuid references public.employees(id) on delete set null,
  author_name text default '',
  body text not null default '',
  photos jsonb not null default '[]'::jsonb,     -- [{ path, w, h }] in the private "message-photos" bucket
  created_at timestamptz default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc);

-- Channels: every active employee. DMs: members only.
create or replace function public.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_active_employee() and exists (
    select 1 from public.conversations c
    where c.id = p_conv and (c.kind = 'channel'
      or exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.employee_id = auth.uid())))
$$;

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
revoke all on public.conversations, public.conversation_members, public.messages from anon;

create policy conv_select on public.conversations for select to authenticated using (public.can_access_conversation(id));
create policy conv_admin  on public.conversations for all to authenticated
  using (kind = 'channel' and public.is_admin()) with check (kind = 'channel' and public.is_admin());
create policy cm_select on public.conversation_members for select to authenticated using (public.can_access_conversation(conversation_id));
create policy msg_select on public.messages for select to authenticated using (public.can_access_conversation(conversation_id));
create policy msg_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_conversation(conversation_id));
create policy msg_delete on public.messages for delete to authenticated using (author_id = auth.uid() or public.is_admin());

create or replace function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch after insert on public.messages for each row execute function public.touch_conversation();
revoke all on function public.touch_conversation() from public, anon, authenticated;

-- Open (or create) the DM between me and someone else.
create or replace function public.start_dm(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.is_active_employee() or p_other = auth.uid()
     or not exists (select 1 from public.employees where id = p_other and active) then
    raise exception 'Not allowed';
  end if;
  select c.id into v from public.conversations c
   where c.kind = 'dm'
     and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.employee_id = auth.uid())
     and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.employee_id = p_other)
   limit 1;
  if v is null then
    insert into public.conversations (kind, created_by) values ('dm', auth.uid()) returning id into v;
    insert into public.conversation_members (conversation_id, employee_id) values (v, auth.uid()), (v, p_other);
  end if;
  return v;
end $$;

create or replace function public.mark_read(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_conversation(p_conv) then raise exception 'Not allowed'; end if;
  insert into public.conversation_members (conversation_id, employee_id, last_read_at) values (p_conv, auth.uid(), now())
  on conflict (conversation_id, employee_id) do update set last_read_at = now();
end $$;

-- Inbox: every conversation I can see, newest first, with preview + unread count.
create or replace function public.my_conversations()
returns table (id uuid, kind text, name text, topic text, other_id uuid, other_name text, other_photo text,
               last_message_at timestamptz, last_body text, last_author text, unread integer)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.name, c.topic, o.id, o.name, o.photo_url, c.last_message_at,
         lm.body, lm.author_name,
         (select count(*)::int from public.messages x
           where x.conversation_id = c.id and x.author_id is distinct from auth.uid()
             and x.created_at > coalesce(me.last_read_at, 'epoch'))
  from public.conversations c
  left join public.conversation_members me on me.conversation_id = c.id and me.employee_id = auth.uid()
  left join lateral (select e.id, e.name, e.photo_url from public.conversation_members m join public.employees e on e.id = m.employee_id
                     where c.kind = 'dm' and m.conversation_id = c.id and m.employee_id <> auth.uid() limit 1) o on true
  left join lateral (select x.body, x.author_name, x.photos from public.messages x where x.conversation_id = c.id order by x.created_at desc limit 1) lm on true
  where public.can_access_conversation(c.id)
  order by (c.kind = 'channel') desc, c.last_message_at desc
$$;

revoke all on function public.can_access_conversation(uuid), public.start_dm(uuid), public.mark_read(uuid), public.my_conversations() from public, anon;
grant execute on function public.can_access_conversation(uuid), public.start_dm(uuid), public.mark_read(uuid), public.my_conversations() to authenticated;

-- Message photos: private; readable by people in that conversation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('message-photos', 'message-photos', false, 15728640, array['image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do nothing;
create policy msg_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'message-photos' and public.can_access_conversation(((storage.foldername(name))[1])::uuid));
create policy msg_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'message-photos' and public.can_access_conversation(((storage.foldername(name))[1])::uuid));

alter publication supabase_realtime add table public.messages, public.conversations;

-- The channel everyone starts in.
insert into public.conversations (kind, name, topic) values ('channel', 'Crew Chat', 'Everyone at Empire Electric');
