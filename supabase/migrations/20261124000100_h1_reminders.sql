begin;

-- Keep the delivery ledger outside records (which is synced to portal clients).
create schema if not exists ict_reminders;
revoke all on schema ict_reminders from public, anon, authenticated;

create table ict_reminders.delivery (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('d_cplan', 'd_kal')),
  source_id text not null,
  event_day date not null,
  recipient_id text not null,
  channel text not null check (channel in ('portal', 'wa')),
  status text not null check (status in ('created', 'sending', 'accepted', 'rejected', 'unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  provider_ref text,
  result_code text,
  unique (source, source_id, event_day, recipient_id, channel)
);

-- Operator-managed consent, bound to the exact normalized destination.
create table ict_reminders.wa_consent (
  recipient_id text primary key,
  phone text not null check (phone ~ '^[1-9][0-9]{7,14}$'),
  recorded_at timestamptz not null default now()
);

create function ict_reminders.local_timestamp(value text)
returns timestamp language plpgsql stable strict set search_path = pg_catalog as $$
begin
  if value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?)?$' then
    return null;
  end if;
  return value::timestamp;
exception when invalid_datetime_format or datetime_field_overflow then
  return null;
end;
$$;

create view ict_reminders.due as
with source as (
  select collection, id, data, nullif(btrim(data->>'jadwal'), '') as schedule,
    btrim(data->>'tanggal') as calendar_date
  from public.records
  where collection in ('d_cplan', 'd_kal') and id <> '_'
), events as (
  select collection, id, data,
    case when schedule like '%T%' then ict_reminders.local_timestamp(schedule)
         when schedule is null and collection = 'd_kal' and length(calendar_date) = 10
           then ict_reminders.local_timestamp(calendar_date) end as local_time,
    schedule is not null as timed,
    left(coalesce(nullif(btrim(case collection when 'd_cplan' then data->>'judul' else data->>'kegiatan' end), ''), 'Kegiatan'), 240) as title
  from source
), people as (
  select id, btrim(data->>'nama') as name,
    btrim(data->>'wa') as phone,
    count(*) over (partition by btrim(data->>'nama')) as name_count
  from public.records where collection = 'users' and id <> '_'
)
select distinct e.collection, e.id as source_id, e.local_time::date as event_day,
  u.id as recipient_id, u.name, u.phone, e.title,
  to_char(e.local_time, case when e.timed then 'DD/MM/YYYY HH24:MI "WIB"' else 'DD/MM/YYYY' end) as event_label
from events e
cross join lateral unnest(case when e.collection = 'd_cplan' then array[e.data->>'pic']
                             else string_to_array(e.data->>'pic', ',') end) as pic(name)
join people u on u.name = btrim(pic.name) and u.name <> '' and u.name_count = 1
where e.local_time::date = (now() at time zone 'Asia/Jakarta')::date + 1
  and coalesce(e.data->>'progres','') not in ('Published','Selesai','Hold');

create function public.ict_h1_run(enable_wa boolean default false)
returns table (delivery_id uuid, phone text, title text, event_label text)
language plpgsql security definer set search_path = pg_catalog as $$
begin
  -- A committed portal ledger entry and its notification are atomic. The ledger
  -- prevents recreation even after a user or retention job removes the record.
  with due as materialized (select * from ict_reminders.due), inserted as (
    insert into ict_reminders.delivery (source, source_id, event_day, recipient_id, channel, status)
    select d.collection, d.source_id, d.event_day, d.recipient_id, 'portal', 'created'
    from due d order by d.collection, d.source_id, d.event_day, d.recipient_id
    on conflict (source, source_id, event_day, recipient_id, channel) do nothing
    returning *
  )
  insert into public.records (collection, id, data)
  select 'notif', i.id::text, jsonb_build_object(
    'id', i.id::text, 'toId', i.recipient_id, 'to', d.name,
    'text', 'Pengingat H-1: ' || d.title || ' — ' || d.event_label,
    't', to_char(now() at time zone 'Asia/Jakarta', 'DD/MM/YYYY HH24:MI:SS'),
    'ts', floor(extract(epoch from now()) * 1000)::bigint,
    'by', 'Pengingat Otomatis', 'rd', '[]'::jsonb)
  from inserted i join due d on (i.source, i.source_id, i.event_day, i.recipient_id) =
    (d.collection, d.source_id, d.event_day, d.recipient_id);

  if enable_wa then
    -- Claim before calling Meta. Never automatically re-claim a stale sending
    -- row: Meta may have accepted the request before the worker timed out.
    return query
    with eligible as materialized (
      select d.*, case
        when d.phone ~ '^[+0-9() .-]+$' then
          regexp_replace(regexp_replace(d.phone, '[^0-9]', '', 'g'), '^0(?!0)', '62')
        end as normalized_phone
      from ict_reminders.due d
    ), batch as materialized (
      select e.* from eligible e
      join ict_reminders.wa_consent consent on consent.recipient_id = e.recipient_id and consent.phone = e.normalized_phone
      where e.normalized_phone ~ '^[1-9][0-9]{7,14}$'
        and not exists (select 1 from ict_reminders.delivery x where x.channel = 'wa'
          and (x.source, x.source_id, x.event_day, x.recipient_id) =
              (e.collection, e.source_id, e.event_day, e.recipient_id))
      order by e.collection, e.source_id, e.event_day, e.recipient_id limit 20
    ), claimed as (
      insert into ict_reminders.delivery (source, source_id, event_day, recipient_id, channel, status)
      select b.collection, b.source_id, b.event_day, b.recipient_id, 'wa', 'sending'
      from batch b order by b.collection, b.source_id, b.event_day, b.recipient_id
      on conflict (source, source_id, event_day, recipient_id, channel) do nothing
      returning *
    )
    select c.id, b.normalized_phone, b.title, b.event_label
    from claimed c join batch b on (c.source, c.source_id, c.event_day, c.recipient_id) =
      (b.collection, b.source_id, b.event_day, b.recipient_id);
  end if;
end;
$$;

create function public.ict_h1_finish(delivery_id uuid, outcome text, message_id text, code text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
begin
  if outcome is null or outcome not in ('accepted', 'rejected', 'unknown') then
    raise exception 'Invalid outcome';
  end if;
  update ict_reminders.delivery d set status = outcome, provider_ref = left(message_id, 255),
    result_code = left(code, 64), updated_at = now()
  where d.id = delivery_id and d.channel = 'wa' and d.status = 'sending';
  return found;
end;
$$;

revoke all on function public.ict_h1_run(boolean), public.ict_h1_finish(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ict_h1_run(boolean), public.ict_h1_finish(uuid, text, text, text) to service_role;
commit;
