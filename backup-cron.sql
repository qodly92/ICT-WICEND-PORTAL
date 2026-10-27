-- ICT Portal – jadwal otomatis (opsional). Ganti GANTI-PROJECT-ID dan GANTI-SERVICE-ROLE-KEY, lalu jalankan di SQL Editor.
-- Kunci service role hanya ditempel di sini (di database), jangan masukkan ke index.html.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Backup harian ke Google Drive: 00.00 WIB (= 17.00 UTC)
select cron.schedule('ict-backup-drive', '0 17 * * *', $$
  select net.http_post(
    url := 'https://GANTI-PROJECT-ID.supabase.co/functions/v1/backup-drive',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer GANTI-SERVICE-ROLE-KEY'),
    body := '{"mode":"all"}'::jsonb)
$$);

-- Bersihkan pemberitahuan lebih dari 30 hari: 01.00 WIB
select cron.schedule('ict-clean-notif', '0 18 * * *', $$
  delete from public.records
  where collection='notif' and (data->>'ts')::numeric < (extract(epoch from now()) - 2592000) * 1000
$$);

-- Menghentikan jadwal: select cron.unschedule('ict-backup-drive');
