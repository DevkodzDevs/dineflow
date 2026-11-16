// TEMPORARY probe fixture — deleted before commit. Renders SiteView (and its head) on made-up data (no database).
import { SiteView } from "../[slug]/SiteView";
import { siteMeta } from "../[slug]/meta";
import { pick, type Q } from "./fixture";
import { siteLang } from "@/lib/siteWords";

export async function generateMetadata({ searchParams }: { searchParams: Promise<Q> }) { const q = await searchParams, d = pick(q); return siteMeta(d, "http://localhost:3141", siteLang(q.lang, d.options)); }
export default async function Probe({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams, d = pick(q);
  return <SiteView d={d} url="https://www.dineflow.cloud/site/zz-probe" lang={siteLang(q.lang, d.options)} />;
}
