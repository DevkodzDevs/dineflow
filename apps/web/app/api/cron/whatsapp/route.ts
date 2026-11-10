import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { drainOutbox } from "@/lib/whatsapp";

/**
 * The WhatsApp sender (0177) — vercel.json runs it every five minutes. Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>`; any other scheduler may call it with ?key=<CRON_SECRET>. It fails closed like the nightly backup: with
 * CRON_SECRET unset it is refused, and with no SUPABASE_SERVICE_ROLE_KEY it cannot take from the outbox (wa_outbox_take is
 * the service role's). Then: claim up to 50 queued rows with their property's credentials, post each to Graph, record
 * the answer. Nothing of DineFlow's is used to send — the credentials are each property's own.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set on the server, so the WhatsApp sender is off." }, { status: 503 });
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || new URL(req.url).searchParams.get("key") || "";
  if (!same(given, secret)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so the WhatsApp sender cannot read the outbox." }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const r = await drainOutbox(db, 50);
  return NextResponse.json({ ok: true, ...r });
}
