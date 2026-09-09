import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export async function GET(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "no token" }, { status: 401 });
  const since = new URL(req.url).searchParams.get("since") || null;
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await s.rpc("box_pull", { p_token: token, p_since: since });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("unknown box") ? 401 : 500 });
  return NextResponse.json(data);
}
