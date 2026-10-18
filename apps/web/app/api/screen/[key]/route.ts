import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * The TV's feed as a plain GET (0103 screen_feed). The screen page used to poll a server action, and a server
 * action's id changes with every build — after a deploy a TV left on for days kept asking for an action that no
 * longer existed and froze on "Reconnecting…". A route's address does not change. 404 when the key is wrong,
 * rotated, or the place is closed.
 */
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9a-f]{16,64}$/.test(key)) return NextResponse.json(null, { status: 404 });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc("screen_feed", { p_key: key });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  if (!data) return NextResponse.json(null, { status: 404, headers: { "cache-control": "no-store" } });
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
