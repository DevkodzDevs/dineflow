import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * The waiting-list board's feed as a plain GET (0179 `screen_queue`), for the same reason the counter TV has one
 * (`../route.ts`): a server action's id changes with every build and a TV left on for days would freeze. Numbers,
 * party sizes and held tables only — never a name or a phone. 404 when the key is wrong, rotated, or the place is closed.
 */
export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!/^[0-9a-f]{16,64}$/.test(key)) return NextResponse.json(null, { status: 404 });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc("screen_queue", { p_key: key });
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  if (!data) return NextResponse.json(null, { status: 404, headers: { "cache-control": "no-store" } });
  return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
}
