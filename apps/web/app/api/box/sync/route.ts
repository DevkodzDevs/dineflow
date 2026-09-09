import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
/** An on-premise Box phones home here. Token in the Authorization header identifies it. */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await s.rpc("box_sync", { p_token: token, p_body: body });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("unknown box") ? 401 : 500 });
  return NextResponse.json(data);
}
