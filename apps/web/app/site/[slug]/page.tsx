import { notFound } from "next/navigation";
import { site, origin } from "./data";
import { siteMeta, siteHome } from "./meta";
import { SiteView } from "./SiteView";
import { siteLang } from "@/lib/siteWords";

/**
 * A property's own website (0185, 2026-11-14): /site/<slug>, made in Settings → Create website from a checklist. Nothing on
 * it is typed twice — the menu, room types, facilities, offers and photos are the property's own, read by `website_public`.
 *
 * Speed (the owner: "no lag, no hang, nothing that slows us down"): a server component, whole without JavaScript (links
 * and <details>; SiteFx adds the reveals with one observer and no scroll listener); one database call per property per 30 s
 * on a server (data.ts), nothing kept for a place that is not there; no session is read (middleware SESSION_FREE). Ordering
 * and booking are not rebuilt here: the buttons open /dine, /queue and /book, which already take them.
 *
 * Found and shared (2026-11-16, the owner: "what this kind of client needs for SEO and social media should fill itself in"):
 * the head is written by meta.ts from the property's kind, cuisine and town; the share card is drawn by card.tsx
 * (opengraph-image.tsx); the tab's icon is the property's own logo; the page is listed in /site/sitemap.xml.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> };

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params; const d = await site(slug);
  if (!d) return { title: "Not found", robots: { index: false } };
  return siteMeta(d, await origin(), siteLang((await searchParams).lang, d.options));
}

export default async function SitePage({ params, searchParams }: Props) {
  const { slug } = await params; const d = await site(slug);
  if (!d) notFound();
  /* ?lang=ta / ?lang=hi — only a language this client switched on; anything else is English */
  return <SiteView d={d} url={siteHome(d, await origin())} lang={siteLang((await searchParams).lang, d.options)} />;
}
