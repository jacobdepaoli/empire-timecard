-- Removes every Empire Hub demo row (all demo ids start with de000000-). Real data is untouched.
begin;
delete from public.messages            where id::text like 'de000000-%';
delete from public.conversations       where id::text like 'de000000-%';
delete from public.announcements       where id::text like 'de000000-%';   -- reads + comments cascade
delete from public.pto_requests        where id::text like 'de000000-%';
delete from public.schedule_entries    where id::text like 'de000000-%';
delete from public.time_logs           where id::text like 'de000000-%';
delete from public.tm_sheets           where id::text like 'de000000-%';
delete from public.job_updates         where id::text like 'de000000-%';   -- likes + comments cascade
delete from public.jobs                where id::text like 'de000000-%';
update public.conversations c set last_message_at = coalesce((select max(created_at) from public.messages m where m.conversation_id = c.id), c.created_at);
commit;
