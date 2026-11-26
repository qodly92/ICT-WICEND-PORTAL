-- Run only in a disposable staging database after applying the migration.
-- Rollback keeps fixtures and resulting deliveries out of the database.
begin;
do $$
declare
  tomorrow text := ((now() at time zone 'Asia/Jakarta')::date + 1)::text;
  claim uuid;
begin
  insert into public.records (collection,id,data) values
    ('users','h1-smoke-a','{"nama":"H1 Smoke A","wa":"0812-3456-7890"}'),
    ('users','h1-smoke-b','{"nama":"H1 Smoke B"}'),
    ('d_cplan','h1-smoke-c',jsonb_build_object('judul','Coach','jadwal',tomorrow || 'T09:30','pic','H1 Smoke A')),
    ('d_kal','h1-smoke-k',jsonb_build_object('kegiatan','Calendar','tanggal',tomorrow,'pic','H1 Smoke B, H1 Smoke B')),
    ('d_kal','h1-smoke-t',jsonb_build_object('kegiatan','Timed','tanggal','2000-01-01','jadwal',tomorrow || 'T10:15','pic','H1 Smoke B')),
    ('d_kal','h1-smoke-x',jsonb_build_object('tanggal',tomorrow,'jadwal','2026-02-30T07:30','pic','H1 Smoke A'));
  insert into ict_reminders.wa_consent (recipient_id, phone) values ('h1-smoke-a','6281234567890');
  perform * from public.ict_h1_run(false);
  if (select count(*) from public.records where collection = 'notif' and data->>'toId' in ('h1-smoke-a','h1-smoke-b')) <> 3 then
    raise exception 'Expected exactly three portal reminders';
  end if;
  select delivery_id into strict claim from public.ict_h1_run(true) where phone = '6281234567890';
  if not public.ict_h1_finish(claim, 'accepted', 'wamid.test', null) then raise exception 'Cannot record outcome'; end if;
  if exists (select 1 from public.ict_h1_run(true) where phone = '6281234567890') then raise exception 'Duplicate WA claim'; end if;
  delete from public.records where collection = 'notif' and data->>'toId' = 'h1-smoke-a';
  perform * from public.ict_h1_run(false);
  if exists (select 1 from public.records where collection = 'notif' and data->>'toId' = 'h1-smoke-a') then raise exception 'Recreated a deleted notification'; end if;
  if has_function_privilege('anon', 'public.ict_h1_run(boolean)', 'execute') or
     has_function_privilege('authenticated', 'public.ict_h1_finish(uuid,text,text,text)', 'execute') then
    raise exception 'Unexpected RPC grant';
  end if;
end;
$$;
rollback;
