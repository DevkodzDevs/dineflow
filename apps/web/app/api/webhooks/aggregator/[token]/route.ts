import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Aggregator webhook — give this URL to Swiggy / Zomato / UrbanPiper / your own website:
 *   POST https://<your-app>/api/webhooks/aggregator/<channel token>
 * The token is the credential, so no key or login is needed here.
 * Accepts each partner's own JSON shape; the database function normalises and maps it to your menu.
 */
const client = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const { data, error } = await client().rpc("ingest_online_order", { p_token: token, p_payload: body });
  // a public URL: say what the sender can act on, never the database's own words
  if (error) { const unknown = error.message.includes("unknown channel"); if (!unknown) console.error("[aggregator]", error.message); return NextResponse.json({ error: unknown ? "unknown channel" : "could not record the order" }, { status: unknown ? 404 : 500 }); }
  return NextResponse.json(data);
}
/* A platform's partner tools check the address before they send orders to it (2026-10-29, 0153): say truthfully whether
   this is a real channel — its name and whether it is taking orders — and 404 a mistyped one. It used to answer ok for
   any token, so a wrong address passed the check and then lost every order. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await client().rpc("channel_hello", { p_token: token });
  const ch = data as { label: string; kind: string; live: boolean } | null;
  if (!ch) return NextResponse.json({ ok: false, error: "unknown channel — copy the address again from DineFlow → Connections" }, { status: 404 });
  return NextResponse.json({
    ok: true, channel: ch.label, kind: ch.kind, taking_orders: ch.live, hint: "POST an order here",
    example: { id: "TEST-1", customer_name: "Ravi", customer_phone: "9840000000", total: 605, items: [{ name: "Chicken biryani", qty: 2, price: 280 }, { name: "Butter naan", qty: 1, price: 45 }] },
    curl: `curl -X POST '<this url>' -H 'content-type: application/json' -d '{"id":"TEST-1","customer_name":"Ravi","total":605,"items":[{"name":"Chicken biryani","qty":2,"price":280}]}'`
  });
}
