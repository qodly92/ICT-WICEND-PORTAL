// Edge Function: notify-push – kirim notifikasi dorong (Web Push) ke perangkat penerima.
// Dipanggil Database Webhook (INSERT pada tabel records). Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  try {
    const p = await req.json()
    const rec = p.record
    if (p.type !== 'INSERT' || rec?.collection !== 'notif') return new Response('skip')
    const n = rec.data
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: rows } = await adm.from('records').select('data').eq('collection', 'users')
    const users = (rows ?? []).map((r) => r.data)
    let to = users
    if (n.to === '@admin') to = users.filter((u) => u.role === 'Manajer')
    else if (n.to === '@dir') to = users.filter((u) => u.role === 'Direktur')
    else if (n.to !== '*') to = users.filter((u) => u.nama === n.to)
    const names = new Set(to.filter((u) => u.nama !== n.by).map((u) => u.nama))
    if (!names.size) return new Response('no recipient')

    const { data: subs } = await adm.from('records').select('id,data').eq('collection', 'd_push')
    const payload = JSON.stringify({
      title: n.by === 'Sistem' ? 'ICT Portal · Pengingat' : 'ICT Portal',
      body: n.text, tag: n.id, url: './',
    })
    let sent = 0
    for (const s of subs ?? []) {
      if (!names.has(s.data?.nama)) continue
      try { await webpush.sendNotification(s.data.sub, payload); sent++ }
      catch (e) {
        // langganan kedaluwarsa → hapus
        if (e?.statusCode === 404 || e?.statusCode === 410) await adm.from('records').delete().eq('collection', 'd_push').eq('id', s.id)
      }
    }
    return new Response('sent ' + sent)
  } catch (e) { return new Response(String(e), { status: 500 }) }
})
