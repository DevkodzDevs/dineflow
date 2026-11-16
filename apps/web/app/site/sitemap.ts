import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { COMPANY } from "@/lib/company";

/**
 * /site/sitemap.xml — every property website that is published (0185, `website_index`): the one list of doors that is not
 * known when the app is built, so it is read from the database, an hour at a time. A demo, a hidden website and a lapsed
 * property are not in it (the database decides). robots.ts names this file beside the main sitemap.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_CLOUD_URL?.replace(/\/$/, "") || `https://${COMPANY.site}`;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];
  try {
    const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await s.rpc("website_index");
    if (error || !Array.isArray(data)) return [];           // before 0185 is on the database: an empty list, not an error page
    return (data as { slug: string; at: string }[]).filter((r) => /^[a-z0-9][a-z0-9-]{0,63}$/.test(r.slug))
      .map((r) => ({ url: `${base}/site/${r.slug}`, lastModified: new Date(r.at), changeFrequency: "weekly" as const, priority: 0.8 }));
  } catch { return []; }
}
