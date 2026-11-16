import type { Metadata } from "next";
import { type SiteData, siteDescription, siteTitle, siteKeywords, sitePin } from "@/lib/website";
import { type SiteLang, siteLangs } from "@/lib/siteWords";

/**
 * What a search engine and a share sheet read in the page's head (2026-11-16, the owner: "what this kind of client
 * needs for SEO and social media should fill itself in"): the title, description and search words are written from the
 * property's kind, cuisine and town (lib/website.ts); the picture is opengraph-image.tsx beside the page; the tab's icon
 * is the property's own logo; the pin and the town are in the geo tags. `base` is the address this server is reached at.
 */
/** The page's own address: the client's domain when it has one (its front door), else /site/<slug> on ours. */
export const siteHome = (d: Pick<SiteData, "slug" | "domain">, base: string): string =>
  d.domain && /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?.)+[a-z]{2,24}$/.test(d.domain) ? `https://${d.domain}` : `${base}/site/${d.slug}`;

export function siteMeta(d: SiteData, base: string, lang: SiteLang = "en"): Metadata {
  const url = siteHome(d, base), description = siteDescription(d), title = siteTitle(d), pin = sitePin(d);
  const langs = siteLangs(d.options);
  const logo = d.logo_url && /^https:\/\/[^\s"'<>]+$/i.test(d.logo_url) ? d.logo_url : null;
  return {
    metadataBase: new URL(base), title: { absolute: title }, description, keywords: siteKeywords(d), applicationName: d.name, /* each language the client offers is its own address (?lang=ta), told to search engines as an alternate of the same page */
    alternates: { canonical: lang === "en" ? url : `${url}?lang=${lang}`, ...(langs.length > 1 ? { languages: Object.fromEntries(langs.map((l) => [l === "en" ? "en-IN" : `${l}-IN`, l === "en" ? url : `${url}?lang=${l}`])) } : {}) },
    openGraph: { title, description, url, type: "website", siteName: d.name, locale: lang === "en" ? "en_IN" : `${lang}_IN` },
    twitter: { card: "summary_large_image", title, description },
    // the tab carries the property's own mark, not DineFlow's
    ...(logo ? { icons: { icon: logo, apple: logo } } : {}),
    other: { "geo.region": "IN", ...(d.district ? { "geo.placename": d.district } : {}), ...(pin ? { "geo.position": `${pin.lat};${pin.lng}`, ICBM: `${pin.lat}, ${pin.lng}` } : {}) },
    // a demo is somebody trying the app, not a business to find in a search
    ...(d.demo ? { robots: { index: false, follow: false } } : {}),
  };
}
