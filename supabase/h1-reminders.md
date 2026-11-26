# H-1 activity reminders

H-1 means **the preceding calendar day in Asia/Jakarta**, not exactly 24 hours before start. The job runs every five minutes, 08:00–23:55 WIB (UTC cron). It catches changes made during H-1, but does not backfill after midnight. Calendar items use `d_kal.jadwal` when present, otherwise `tanggal` (date only). An invalid nonempty `jadwal` is skipped rather than sending for a potentially incorrect date. `d_cplan` requires `jadwal`. Content Planner uses one PIC name; calendar PICs are split on commas. Names are matched exactly after trimming against `users.nama`; unresolved or ambiguous names are skipped. `planner_hidden` does not affect reminders.

## Set up in staging first

1. Apply `migrations/20261124000100_h1_reminders.sql` as the database owner using the SQL Editor or your normal migration workflow. It assumes `public.records(collection text, id text, data jsonb)` with existing app access and unique collection/id. Review existing `records` write and read policies before enabling; the legacy browser sync can expose fields to roles allowed to read `records`. The worker writes `toId` and legacy `to`; the notification UI should prefer `toId` whenever present. Notification UI filtering is not an access policy.
2. Generate a unique random secret (e.g. `openssl rand -hex 32`). In the Edge Function secrets dashboard set `H1_CRON_SECRET`. In Supabase Vault create `ict_h1_cron_secret` with the same value and `ict_h1_project_url` with `https://<project-ref>.supabase.co`. Never put secrets into source control, browser code, or the cron SQL. The hosted function uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for its RPC calls; neither credential is sent by cron.
3. From the portal directory deploy **only** this function when ready: `supabase functions deploy h1-reminders --project-ref <project-ref> --no-verify-jwt`. Gateway JWT verification is intentionally off for this endpoint; its POST handler requires the separate high-entropy `x-h1-cron-secret` header. Do not remove that check. Leave WhatsApp off initially; in-app notifications still run.
4. Verify with a staging event dated tomorrow in WIB, assigned to a uniquely named test user. Send a test POST to `https://<project-ref>.supabase.co/functions/v1/h1-reminders` with `x-h1-cron-secret` and `{}`. A POST without the secret should return 401. Repeat the authorized POST and confirm only one `notif` per event/PIC exists and appears in the UI. Then apply `h1-cron.sql` and confirm the job in Supabase Cron. To pause both channels: `select cron.unschedule('ict-h1-reminders');`.

## Enable official Meta WhatsApp Cloud API

Create a WhatsApp Business sender in Meta and approve an Indonesian utility template for opted-in scheduling reminders. Example body with two positional parameters, in this order, with no variable headers or buttons: `Pengingat H-1 ICT Portal: {{1}} dijadwalkan pada {{2}}. Silakan cek portal untuk detail.` The parameters are the activity title and date/time. Use an appropriately scoped system user token with `whatsapp_business_messaging` and access to the sender. Set Edge secrets:

| Secret | Value |
| --- | --- |
| `H1_WA_ENABLED` | `true` (unset or `false` for portal-only) |
| `H1_META_GRAPH_VERSION` | A supported pinned Graph API version, with `v` prefix |
| `H1_META_PHONE_NUMBER_ID` | Numeric Meta sender **phone number ID**, not the display number |
| `H1_META_ACCESS_TOKEN` | Meta system user token |
| `H1_META_TEMPLATE` | Approved template name |
| `H1_META_LANGUAGE` | Approved locale, defaults to `id` |

Record explicit opt-in only after independently confirming the user's phone and consent. Use the `records.id` from their `users` row; the number must match normalized `users.wa` (format characters are removed, Indonesian leading `0` becomes `62`, otherwise use country code; no `+` in the consent row). Keep the underlying consent evidence separately and remove this row on withdrawal. The table is not exposed to browser clients. Before enabling WhatsApp, verify portal access and that clients cannot alter event or PIC data outside their authorized scope.

```sql
insert into ict_reminders.wa_consent (recipient_id, phone)
values ('<users records.id>', '<country code and digits>')
on conflict (recipient_id) do update
set phone = excluded.phone, recorded_at = now();
-- Revoke: delete from ict_reminders.wa_consent where recipient_id = '<id>';
```

## Delivery and monitoring

The ledger deduplicates by source collection/row, WIB event date, recipient ID, and channel. Same-date edits do not resend; a move to a different date can generate a new reminder when that date is tomorrow. Already-sent reminders cannot be recalled. The portal insert and its ledger entry commit together. For WhatsApp, a committed claim precedes the API call; that prevents duplicate sends even with overlapping cron runs. Each invocation claims at most 20 WhatsApp recipients. An accepted response means Meta accepted the request, **not** that the device received it. There is no built-in webhook; the claim UUID is sent as Meta `biz_opaque_callback_data` for correlation if you configure status webhooks separately.

The worker deliberately does not retry an attempted claim automatically. For a timeout, unexpected response, worker crash, or failure to record the outcome, Meta may have accepted the message. Check Meta status before manually resending; never bulk-reset `sending` or `unknown` rows. `rejected` includes API 4xx errors other than HTTP 408; fix configuration/recipient issues and only reset a specific rejected claim when you have verified that Meta did not accept it and it is still H-1. Missing consent or an invalid number creates no WhatsApp claim and does not block portal delivery. No config/credentials are logged; the worker logs aggregate outcome counts. A cron job marked successful means the HTTP request was queued, not that the worker succeeded: monitor Edge logs/HTTP responses and the ledger.

```sql
select event_day, channel, status, result_code, count(*)
from ict_reminders.delivery
where event_day >= (now() at time zone 'Asia/Jakarta')::date - 7
 group by 1,2,3,4 order by 1 desc,2,3;

select id, event_day, created_at from ict_reminders.delivery
where status = 'sending' and created_at < now() - interval '10 minutes';
```
