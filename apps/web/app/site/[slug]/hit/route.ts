import { createClient } from "@supabase/supabase-js";
import { WEBSITE_HIT_KINDS, type WebsiteHitKind } from "@dineflow/shared";

/**
 * POST /site/<slug>/hit {k} — one more on the website's visitor count (0185 `website_hit`; eighth pass). The page calls
 * it only where the client switched the count on, and the database counts only then. It is a tally: nothing about the
 * visitor is read here or kept there — no cookie, no address, no device. Always answers 204, whatever was sent: a
 * counter must never be a way to learn which places exist.
 */
export const dynamic = "force-dynamic";
const none = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return none();
    const text = await req.text(); if (text.length > 200) return none();
    const k = (JSON.parse(text) as { k?: unknown }).k;
    if (typeof k !== "string" || !(WEBSITE_HIT_KINDS as readonly string[]).includes(k)) return none();
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await s.rpc("website_hit", { p_slug: slug, p_kind: k as WebsiteHitKind });
  } catch { /* a count that fails is a count that is missed, nothing more */ }
  return none();
}
