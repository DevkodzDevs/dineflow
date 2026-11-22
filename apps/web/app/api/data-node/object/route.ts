import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A private stored file for a data node (0189, Master control → Data → NAS, "Photos & documents on this NAS"). Public buckets the
 * node reads straight from storage; a private one — the compliance documents, attendance photos, support files — it asks here,
 * with its token in `x-dineflow-node`. The token is checked by the database (`data_node_call … 'auth'`, which also counts a wrong
 * one against the node throttle), the bucket must be one that server was set to copy, and the bytes come down with the service
 * role — so without SUPABASE_SERVICE_ROLE_KEY on Vercel this answers 503 and the node counts the file as waiting, the same way the
 * cloud's nightly backup waits for that key. Nothing here writes.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const bucket = u.searchParams.get("bucket") ?? "", name = u.searchParams.get("name") ?? "", token = req.headers.get("x-dineflow-node") ?? "";
  if (!token || !bucket || !name || name.includes("..") || name.startsWith("/") || !/^[a-z0-9_-]+$/.test(bucket)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) return NextResponse.json({ error: "the cloud is not configured" }, { status: 500 });
  const asNode = createClient(url, anon, { auth: { persistSession: false } });
  const { data: who, error } = await asNode.rpc("data_node_call", { p_token: token, p_fn: "auth", p_args: {} });
  const w = who as { id?: string; error?: string; mirror_files?: boolean; mirror_buckets?: string[] } | null;
  if (error || !w || w.error || !w.id) return NextResponse.json({ error: "not allowed" }, { status: 403 });
  if (!w.mirror_files || !(w.mirror_buckets ?? []).includes(bucket)) return NextResponse.json({ error: "that bucket is not for this server" }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "needs SUPABASE_SERVICE_ROLE_KEY on Vercel" }, { status: 503 });
  const srv = createClient(url, key, { auth: { persistSession: false } });
  const { data, error: dl } = await srv.storage.from(bucket).download(name);
  if (dl || !data) return NextResponse.json({ error: dl?.message ?? "not found" }, { status: 404 });
  return new Response(data, { headers: { "content-type": data.type || "application/octet-stream", "cache-control": "no-store", "content-length": String(data.size) } });
}
