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
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("unknown channel") ? 404 : 500 });
  return NextResponse.json(data);
}
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.json({
    ok: true, hint: "POST an order here",
    example: { id: "TEST-1", customer_name: "Ravi", customer_phone: "9840000000", total: 605, items: [{ name: "Chicken biryani", qty: 2, price: 280 }, { name: "Butter naan", qty: 1, price: 45 }] },
    curl: `curl -X POST '<this url>' -H 'content-type: application/json' -d '{"id":"TEST-1","customer_name":"Ravi","total":605,"items":[{"name":"Chicken biryani","qty":2,"price":280}]}'`,
    token,
  });
}
