// Edge Function: notify-wa – dipanggil Database Webhook (INSERT pada tabel records)
// Mengirim WhatsApp otomatis lewat Fonnte (https://fonnte.com). Secret: FONNTE_TOKEN
import { createClient } from 'npm:@supabase/supabase-js@2'

const norm = (n: string) => { n = String(n || '').replace(/\D/g, ''); return n.startsWith('0') ? '62' + n.slice(1) : n }

Deno.serve(async (req) => {
  try {
    const p = await req.json()
    const rec = p.record
    if (p.type !== 'INSERT' || rec?.collection !== 'notif') return new Response('skip')
    const n = rec.data
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: cfgRow } = await adm.from('records').select('data').eq('collection', 'cfg').eq('id', '_').maybeSingle()
    if (cfgRow?.data?.wa === false) return new Response('wa off')

    const { data: rows } = await adm.from('records').select('data').eq('collection', 'users')
    const users = (rows ?? []).map((r) => r.data)
    let to = users
    if (n.to === '@admin') to = users.filter((u) => u.role === 'Manajer')
    else if (n.to === '@dir') to = users.filter((u) => u.role === 'Direktur')
    else if (n.to !== '*') to = users.filter((u) => u.nama === n.to)
    to = to.filter((u) => u.wa && u.nama !== n.by)
    const app = cfgRow?.data?.name ?? 'ICT Portal'

    const results = []
    for (const u of to) {
      const r = await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: Deno.env.get('FONNTE_TOKEN')!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: norm(u.wa), message: `[${app}]\n${n.text}\n\n${n.t ?? ''}` }),
      })
      results.push(`${u.nama}:${r.status}`)
    }
    return new Response(results.join(', ') || 'no recipient')
  } catch (e) { return new Response(String(e), { status: 500 }) }
})
