import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";
import { KINDS } from "@/lib/site/content";
import { POSTS } from "@/lib/site/posts";

/**
 * Only the pages a stranger is meant to find. Everything behind a login is deliberately absent —
 * a sitemap is a list of doors, and there is no reason to publish the ones that are locked.
 */
export const dynamic = "force-static";

const base = () => {
  const url = process.env.NEXT_PUBLIC_CLOUD_URL?.replace(/\/$/, "");
  return url || `https://${COMPANY.site}`;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const at = new Date(COMPANY.effective);
  const b = base();
  return [
    // the public site (2026-10-29, item 18): the front page, a page for each kind of business, the blog
    { url: `${b}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    ...KINDS.map((k) => ({ url: `${b}/for/${k.slug}`, lastModified: at, changeFrequency: "monthly" as const, priority: 0.9 })),
    { url: `${b}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    ...POSTS.map((p) => ({ url: `${b}/blog/${p.slug}`, lastModified: new Date(p.updated ?? p.date), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${b}/login`, lastModified: at, changeFrequency: "monthly", priority: 0.8 },
    { url: `${b}/signup`, lastModified: at, changeFrequency: "monthly", priority: 0.8 },
    { url: `${b}/legal/terms`, lastModified: at, changeFrequency: "yearly", priority: 0.5 },
    { url: `${b}/legal/privacy`, lastModified: at, changeFrequency: "yearly", priority: 0.5 },
    { url: `${b}/legal/refunds`, lastModified: at, changeFrequency: "yearly", priority: 0.5 },
    { url: `${b}/legal/contact`, lastModified: at, changeFrequency: "yearly", priority: 0.6 },
  ];
}
