import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
/**
 * Pulls every configured iCal feed and blocks those dates in DineFlow.
 * Called from the Channels page, and every 15 minutes by the Vercel cron in vercel.json.
 */
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

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
  if (process.env.CRON_SECRET && url.searchParams.get("key") && url.searchParams.get("key") !== process.env.CRON_SECRET) return NextResponse.json({ error: "bad key" }, { status: 401 });
  const s = client();
  const { data: channels, error } = await s.rpc("ical_channels", { p_channel: url.searchParams.get("channel") });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const report: Record<string, unknown>[] = [];
  for (const ch of (channels ?? []) as { id: string; label: string; kind: string; import_url: string }[]) {
    try {
      const res = await fetch(ch.import_url, { headers: { "user-agent": "DineFlow/4.1" }, cache: "no-store" });
      if (!res.ok) throw new Error(`feed returned ${res.status}`);
      const events = parseIcs(await res.text());
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
  if ((channels ?? []).length === 0) report.push({ note: "No iCal feeds configured yet. Add an OTA channel and paste their calendar link." });
  return NextResponse.json({ ok: true, report });
}
