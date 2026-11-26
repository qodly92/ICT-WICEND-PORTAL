import { timingSafeEqual } from "node:crypto";

const env = (key: string) => Deno.env.get(key) ?? "";
const encoder = new TextEncoder();
const json = (body: unknown, status = 200) => Response.json(body, { status });

type Claim = { delivery_id: string; phone: string; title: string; event_label: string };
type Outcome = { outcome: "accepted" | "rejected" | "unknown"; message_id: string | null; code: string | null };
type MetaConfig = { version: string; phoneId: string; token: string; template: string; language: string };

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`RPC ${name}: ${response.status}`);
  return await response.json() as T;
}

async function send(claim: Claim, meta: MetaConfig): Promise<Outcome> {
  try {
    const title = claim.title.replace(/[\s\u0000-\u001f]+/g, " ").trim() || "Kegiatan";
    const response = await fetch(`https://graph.facebook.com/${meta.version}/${meta.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${meta.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: claim.phone,
        type: "template",
        biz_opaque_callback_data: claim.delivery_id,
        template: {
          name: meta.template,
          language: { code: meta.language },
          components: [{ type: "body", parameters: [title, claim.event_label].map((text) => ({ type: "text", text })) }],
        },
      }),
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    const data = await response.json().catch(() => null);
    const id = data?.messages?.[0]?.id;
    if (response.ok && typeof id === "string" && id.startsWith("wamid.")) {
      return { outcome: "accepted", message_id: id, code: null };
    }
    const code = Number.isInteger(data?.error?.code) ? `meta_${data.error.code}` : `http_${response.status}`;
    return { outcome: response.status >= 400 && response.status < 500 && response.status !== 408 ? "rejected" : "unknown", message_id: null, code };
  } catch {
    return { outcome: "unknown", message_id: null, code: "transport_error" };
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const secret = encoder.encode(env("H1_CRON_SECRET"));
  const presented = encoder.encode(req.headers.get("x-h1-cron-secret") ?? "");
  if (secret.length < 32 || !env("SUPABASE_URL") || !env("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "Missing worker configuration" }, 503);
  }
  if (secret.length !== presented.length || !timingSafeEqual(secret, presented)) return json({ error: "Unauthorized" }, 401);

  const waEnabled = env("H1_WA_ENABLED") === "true";
  const meta = {
    version: env("H1_META_GRAPH_VERSION"), phoneId: env("H1_META_PHONE_NUMBER_ID"),
    token: env("H1_META_ACCESS_TOKEN"), template: env("H1_META_TEMPLATE"), language: env("H1_META_LANGUAGE") || "id",
  };
  const waReady = waEnabled && /^v\d+\.\d+$/.test(meta.version) && /^\d+$/.test(meta.phoneId) &&
    !!meta.token && /^[a-z0-9_]+$/.test(meta.template) && /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(meta.language);
  try {
    const claims = await rpc<Claim[]>("ict_h1_run", { enable_wa: waReady });
    const counts = { claimed: claims.length, accepted: 0, rejected: 0, unknown: 0, finishFailed: 0 };
    // Cap the batch in SQL; send concurrently in groups of five.
    for (let start = 0; start < claims.length; start += 5) {
      await Promise.all(claims.slice(start, start + 5).map(async (claim) => {
        const result = await send(claim, meta);
        counts[result.outcome]++;
        try {
          if (!await rpc<boolean>("ict_h1_finish", { delivery_id: claim.delivery_id, ...result })) counts.finishFailed++;
        } catch {
          counts.finishFailed++;
        }
      }));
    }
    const waMisconfigured = waEnabled && !waReady;
    console.info("H1 run", { ...counts, waMisconfigured });
    return json({ ...counts, waMisconfigured }, waMisconfigured || counts.finishFailed ? 503 : 200);
  } catch {
    console.error("H1 run failed");
    return json({ error: "Reminder run failed" }, 500);
  }
});
