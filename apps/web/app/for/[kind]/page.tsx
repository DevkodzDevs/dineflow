import { notFound } from "next/navigation";
import { KindPage } from "@/components/site/KindPage";
import { KINDS } from "@/lib/site/content";

/** /for/restaurants, /for/cafes, /for/cloud-kitchens, /for/hotels-resorts (2026-10-29, item 18) — built at deploy, static. */
export const dynamicParams = false;
export function generateStaticParams() { return KINDS.map((k) => ({ kind: k.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params; const k = KINDS.find((x) => x.slug === kind);
  return k ? { title: `DineFlow ${k.title.toLowerCase()} — India`, description: k.intro } : { title: "Not found" };
}
export default async function ForKind({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params; const k = KINDS.find((x) => x.slug === kind);
  if (!k) notFound();
  return <KindPage slug={k.slug} />;
}
