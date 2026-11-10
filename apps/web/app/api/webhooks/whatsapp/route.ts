import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { metaSignatureOk, statusesOf } from "@/lib/whatsapp";

/**
 * Meta's WhatsApp webhook (0177) — one URL for the deployment:  https://<your-app>/api/webhooks/whatsapp
 *
 * In the Meta app → WhatsApp → Configuration, paste this address and the verify token (WHATSAPP_VERIFY_TOKEN on the
 * server — any phrase; Meta asks for it once, below), then subscribe to the `messages` field. Every delivery after that is
 * signed with the app's secret (WHATSAPP_APP_SECRET, Meta app → App settings → Basic): `X-Hub-Signature-256:
 * sha256=<hmac>` over the raw body, checked in constant time like the Razorpay webhook. The statuses in it — sent,
 * delivered, read, failed, each by message id — mark the outbox row (wa_outbox_status, service role). Nothing else in the
 * body is acted on: an inbound message is acknowledged and dropped. Idempotent: a status never moves a row backwards.
 *
 * Fails closed: no verify token → 503 on the handshake; no app secret → 503 on a delivery; a bad signature → 401 and
 * nothing read. Meta retries a non-2xx, so a 503 while the keys are being set loses nothing.
 */
export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The one-time handshake: hub.mode=subscribe & hub.verify_token=<ours> → answer hub.challenge as plain text. */
export async function GET(req: Request) {
  const want = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!want) return NextResponse.json({ error: "WHATSAPP_VERIFY_TOKEN is not set on the server, so the webhook cannot be verified yet." }, { status: 503 });
  const u = new URL(req.url);
  const mode = u.searchParams.get("hub.mode"), token = u.searchParams.get("hub.verify_token") ?? "", challenge = u.searchParams.get("hub.challenge") ?? "";
  if (mode === "subscribe" && same(token, want)) return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  if (!mode) return NextResponse.json({ ok: true, hint: "Point the Meta WhatsApp webhook (field: messages) at this URL with your verify token." });
  return NextResponse.json({ error: "verify token does not match" }, { status: 403 });
}

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "WHATSAPP_APP_SECRET is not set on the server, so deliveries cannot be checked." }, { status: 503 });
  const raw = await req.text();
  if (!metaSignatureOk(secret, raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "not json" }, { status: 400 }); }
  const statuses = statusesOf(body);
  if (!statuses.length) return NextResponse.json({ ok: true, ignored: "no statuses" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so statuses cannot be recorded." }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let updated = 0;
  for (const s of statuses) {
    const { data } = await db.rpc("wa_outbox_status", { p_provider_id: s.id, p_status: s.status, p_error: s.error });
    if (data) updated++;
  }
  return NextResponse.json({ ok: true, statuses: statuses.length, updated });
}
