import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { createClient as sessionClient } from "@/lib/supabase/server";
/**
 * Pulls every configured iCal feed and blocks those dates in DineFlow.
 * Called from the Channels page, and once a night by the Vercel cron in vercel.json (21:00 UTC,
 * i.e. 02:30 IST). Vercel's Hobby plan allows a cron to run only once a day — for tighter syncing
 * either move to Pro and set a quarter-hourly schedule in vercel.json, or call this route from any
 * external scheduler (pass ?key=<CRON_SECRET>). The Channels page also syncs on demand.
 *
 * Who may run it (it used to run for anyone, for every property, if no key was given):
 *  · the scheduler — `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends) or ?key=. With
 *    CRON_SECRET unset the scheduled run is refused: it fails closed.
 *  · a signed-in user — their own property's channels only, found through RLS with their session.
 * The writes run with the service role: since 0085, ical_channels / ingest_ota_booking / ota_log are
 * not callable with the anon key at all.
 */
const service = () => process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/* A feed URL is typed by staff. Fetch only public https hosts — never this server's own network
   (localhost, private ranges, the cloud metadata address) — with a time limit and a size limit, so
   one dead or enormous feed cannot stall the nightly run or be used to probe the inside. */
const MAX_FEED = 2 * 1024 * 1024;
function publicHttps(raw: string): URL | null {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (h.includes(":") && (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:"))) return null;
  return u;
}
async function readFeed(url: URL) {
  const res = await fetch(url, { headers: { "user-agent": "DineFlow/4.1" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`feed returned ${res.status}`);
  const reader = res.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > MAX_FEED) { await reader.cancel(); throw new Error("feed is larger than 2 MB"); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parseIcs(text: string) {
  const out: { uid: string; start: string; end: string; summary: string }[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => (new RegExp(`^${k}[^:]*:(.*)$`, "m").exec(block)?.[1] ?? "").trim();
    const fmt = (v: string) => (v.length >= 8 ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : "");
    const start = fmt(get("DTSTART")), end = fmt(get("DTEND"));
    if (start && end) out.push({ uid: get("UID") || `${start}-${end}`, start, end, summary: get("SUMMARY") });
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  const scheduler = !!secret && !!given && same(given, secret);
  // who is asking comes first — a stranger learns nothing about how this server is set up
  const db = scheduler ? null : await sessionClient();
  if (db) {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to sync channels." }, { status: 401 });
  }
  const s = service();
  if (!s) { console.error("[ota/sync] SUPABASE_SERVICE_ROLE_KEY is not set"); return NextResponse.json({ error: "Channel sync is not available on this server." }, { status: 503 }); }
  const only = url.searchParams.get("channel");
  let channels: { id: string; label: string; kind: string; import_url: string }[] = [];
  if (scheduler) {
    const { data, error } = await s.rpc("ical_channels", { p_channel: only });
    if (error) return NextResponse.json({ error: "Could not read the channels." }, { status: 500 });
    channels = (data ?? []) as typeof channels;
  } else {
    // a person pressing Sync on the Channels page: RLS hands back their own property's feeds, no others
    let q = db!.from("ota_channels").select("id, label, kind, import_url").eq("mode", "ical").not("import_url", "is", null);
    if (only) q = q.eq("id", only);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: "Could not read the channels." }, { status: 500 });
    channels = (data ?? []) as typeof channels;
  }
  const report: Record<string, unknown>[] = [];
  for (const ch of channels) {
    try {
      const feed = publicHttps(ch.import_url);
      if (!feed) throw new Error("the calendar link must be a public https:// address");
      const events = parseIcs(await readFeed(feed));
      let added = 0;
      for (const e of events) {
        if (new Date(e.end) < new Date(Date.now() - 86400000)) continue;
        if (/available|free/i.test(e.summary)) continue;
        const { data: bid } = await s.rpc("ingest_ota_booking", { p_channel_id: ch.id, p_external_ref: `${ch.kind}:${e.uid}`, p_guest: { full_name: e.summary?.slice(0, 60) || `${ch.label} guest` }, p_check_in: e.start, p_check_out: e.end, p_rate: 0, p_is_block: true });
        if (bid) added++;
      }
      await s.rpc("ota_log", { p_channel: ch.id, p_ok: true, p_message: `${events.length} events read, ${added} new`, p_count: added });
      report.push({ channel: ch.label, events: events.length, added });
    } catch (e) {
      const msg = (e as Error).message;
      await s.rpc("ota_log", { p_channel: ch.id, p_ok: false, p_message: msg, p_count: 0 });
      report.push({ channel: ch.label, error: msg });
    }
  }
  if (channels.length === 0) report.push({ note: "No iCal feeds configured yet. Add an OTA channel and paste their calendar link." });
  return NextResponse.json({ ok: true, report });
}
