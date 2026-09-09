import { createClient } from "@supabase/supabase-js";
/**
 * Your availability as an iCal feed. Paste this URL into Airbnb / Booking.com / Agoda / MakeMyTrip
 * so they stop selling dates you have already booked. The token is the credential.
 */
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const esc = (s: string) => s.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
const d = (x: string) => x.replaceAll("-", "");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await client().rpc("ical_feed", { p_token: token.replace(/\.ics$/, "") });
  if (!data) return new Response("not found", { status: 404 });
  const feed = data as { label: string; property: string; events: { id: string; check_in: string; check_out: string; room: string }[] };
  const now = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DineFlow//Channel//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(feed.property)} — ${esc(feed.label)}`,
    ...feed.events.flatMap((b) => ["BEGIN:VEVENT", `UID:${b.id}@dineflow`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${d(b.check_in)}`, `DTEND;VALUE=DATE:${d(b.check_out)}`,
      `SUMMARY:Not available${b.room ? ` — Room ${esc(b.room)}` : ""}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT"]),
    "END:VCALENDAR"].join("\r\n");
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=300" } });
}
