"use server";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { todayIST } from "@/lib/format";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/** The visitor, as the database may know them (0109): a keyed hash of their address and today's date — it cannot be
 *  turned back into the address, and it changes every day. No secret configured, no hash: the per-place limits still
 *  hold. On Vercel x-forwarded-for is set by the platform itself, so it is the visitor's address. */
async function visitor(): Promise<string | null> {
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  return ip ? createHmac("sha256", secret).update(`feedback|${ip}|${todayIST()}`).digest("hex") : null;
}

/** A guest's private rating (0103 `feedback_submit`; 0109 adds five an hour from one visitor); the limits and the
 *  length cuts are the function's own. */
export async function sendFeedback(slug: string, table: string | null, rating: number, tags: string[], comment: string, name: string, phone: string) {
  const { error } = await anon().rpc("feedback_submit", { p_slug: slug, p_table: table, p_rating: rating, p_tags: tags, p_comment: comment || null, p_name: name || null, p_phone: phone || null, p_ip_hash: await visitor() });
  if (error) return { error: error.message }; return { ok: true };
}
