import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

/**
 * Crawlers get the sign-in page and the four legal documents, and nothing else. A property's
 * storefront, a guest's bill and every screen behind the login stay out of search results —
 * /pay and /record carry one-time tokens, and /dine and /book belong to the property, not to us.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_CLOUD_URL?.replace(/\/$/, "") || `https://${COMPANY.site}`;
  return {
    rules: [{
      userAgent: "*",
      // 0185: /site/<slug> is a property's own website — the one property page that is meant to be found
      allow: ["/", "/for/", "/blog", "/site/", "/login", "/signup", "/legal/"],
      disallow: ["/api/", "/admin", "/pay/", "/record/", "/queue/", "/dine", "/book/", "/account/", "/get"],
    }],
    // the second list is the properties' own websites, read from the database (app/site/sitemap.ts)
    sitemap: [`${base}/sitemap.xml`, `${base}/site/sitemap.xml`],
  };
}
