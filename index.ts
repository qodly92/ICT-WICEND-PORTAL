// Edge Function: backup-drive – unggah backup ke folder Google Drive
// Dipanggil (1) tombol "Backup Drive" oleh admin, (2) jadwal harian pg_cron dengan kunci service role.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, DRIVE_FOLDER_ID
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const FOLDER = Deno.env.get('DRIVE_FOLDER_ID') ?? '17-GOfcS_8xmR9YXrM-LfkfnUWnQTIMID'

async function googleToken(): Promise<string> {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN')!, grant_type: 'refresh_token',
    }),
  })
  const t = await r.json()
  if (!t.access_token) throw new Error('Token Google gagal: ' + JSON.stringify(t))
  return t.access_token
}

async function upload(token: string, name: string, mime: string, bytes: Uint8Array) {
  const b = 'ict' + crypto.randomUUID(), enc = new TextEncoder()
  const head = enc.encode(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [FOLDER] })}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`)
  const tail = enc.encode(`\r\n--${b}--`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length)
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${b}` }, body,
  })
  const out = await r.json()
  if (!r.ok) throw new Error('Drive: ' + JSON.stringify(out))
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!, srv = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const auth = req.headers.get('Authorization') ?? ''
    const adm = createClient(url, srv)

    // Izin: kunci service role (jadwal) atau pengguna Manajer/Direktur
    if (auth !== `Bearer ${srv}`) {
      const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
      const { data: { user } } = await caller.auth.getUser()
      if (!user) return j({ error: 'Belum login' }, 401)
      const { data: me } = await adm.from('records').select('data').eq('collection', 'users').eq('id', user.id).maybeSingle()
      if (!['Manajer', 'Direktur'].includes(me?.data?.role)) return j({ error: 'Hanya admin yang boleh backup' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const token = await googleToken()
    const done: string[] = []
    const stamp = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16).replace('T', '_').replace(':', '') // WIB

    if (body.mode === 'files') {
      for (const f of body.files ?? []) {
        const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))
        const o = await upload(token, f.name.replace(/(\.\w+)$/, `_${stamp}$1`), f.mime, bytes)
        done.push(o.name)
      }
    } else {
      const all: unknown[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await adm.from('records').select('collection,id,data').order('collection').order('id').range(from, from + 999)
        if (error) throw error
        all.push(...data); if (data.length < 1000) break
      }
      const json = JSON.stringify({ exported_at: new Date().toISOString(), count: all.length, records: all })
      const o = await upload(token, `ICT-Portal-backup_${stamp}.json`, 'application/json', new TextEncoder().encode(json))
      done.push(o.name)
    }

    const { data: c } = await adm.from('records').select('data').eq('collection', 'cfg').eq('id', '_').maybeSingle()
    await adm.from('records').upsert({ collection: 'cfg', id: '_', data: { ...(c?.data ?? {}), lastBackup: new Date().toISOString() } })
    return j({ ok: true, files: done })
  } catch (e) { return j({ error: String(e) }, 500) }
})
