import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

/**
 * Only the pages a stranger is meant to find. Everything behind a login is deliberately absent —
 * a sitemap is a list of doors, and there is no reason to publish the ones that are locked.
 */
export const dynamic = "force-static";

const base = () => {
  const url = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return url || `https://${COMPANY.site}`;
};

export default function sitemap(): MetadataRoute.Sitemap {
  const at = new Date(COMPANY.effective);
  const b = base();
  return [
    { url: `${b}/login`, lastModified: at, changeFrequency: "monthly", priority: 0.8 },
    { url: `${b}/signup`, lastModified: at, changeFrequency: "monthly", priority: 0.8 },
    { url: `${b}/legal/terms`, lastModified: at, changeFrequency: "yearly", priority: 0.5 },
    { url: `${b}/legal/privacy`, lastModified: at, changeFrequency: "yearly", priority: 0.5 },
    { url: `${b}/legal/refunds`, lastModified: at, changeFrequency: "yearly", priority: 0.5 },
    { url: `${b}/legal/contact`, lastModified: at, changeFrequency: "yearly", priority: 0.6 },
  ];
}
