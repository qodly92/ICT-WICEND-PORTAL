-- Run after storing ict_h1_project_url and ict_h1_cron_secret in Supabase Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- UTC 01:00–16:55 = WIB 08:00–23:55. Repeat to pick up new records and drain batches.
select cron.schedule('ict-h1-reminders', '*/5 1-16 * * *', $job$
  select net.http_post(
    url := rtrim(u.decrypted_secret, '/') || '/functions/v1/h1-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-h1-cron-secret', s.decrypted_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 125000
  )
  from vault.decrypted_secrets u cross join vault.decrypted_secrets s
  where u.name = 'ict_h1_project_url' and s.name = 'ict_h1_cron_secret';
$job$);
