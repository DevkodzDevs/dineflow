import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { keepFor } from "@/lib/keepFor";
import type { SiteData } from "@/lib/website";

/**
 * The one read behind a property's website — shared by the page, its metadata and its share card, so the three of them
 * cost one database call per property per 30 s on a server (lib/keepFor.ts, the menu page's rule: a hard age limit,
 * never the old answer first). Nothing is kept for a place that is not there, and a slug that could not be a property's
 * never reaches the database.
 */
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const kept = keepFor<SiteData | null>(30000);

export const site = cache(async (slug: string): Promise<SiteData | null> => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return null;
  return kept(slug, async () => { const a = await anon().rpc("website_public", { p_slug: slug }); if (a.error) throw new Error(a.error.message); return (a.data ?? null) as SiteData | null; }, (d) => !!d).catch(() => null);
});

/** The address this server is reached at — the public one when it is set, so links in search data never say localhost. */
export const origin = async () => {
  const h = await headers();
  return (process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`).replace(/\/$/, "");
};
