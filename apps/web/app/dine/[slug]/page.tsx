import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { StorefrontClient } from "./StorefrontClient";
import { restaurantLd, ldJson, type StoreFacts } from "@/lib/schemaorg";
import { keepFor } from "@/lib/keepFor";
export const dynamic = "force-dynamic";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/* The speed check, 2026-11-10 (lib/keepFor.ts). The menu without a table or room code is the same for every visitor, and so
   are today's slots for two: both are kept in memory for 30 s, never longer, so a link passed round a group is one read of
   the menu and not one per visitor. A place that is not there and a failed read are not kept. The kitchen's pause is read
   live on every visit; a dish that just ran out can show for up to 30 s, and `dine_order` refuses it either way. */
const KEEP_MS = 30000;
const keptMenu = keepFor<unknown>(KEEP_MS), keptSlots = keepFor<unknown[] | null>(KEEP_MS);
/** Shared with the page below — called with the same three arguments, so a visit costs one storefront lookup, not two. */
/** `table` is the code on a table, `room` the code in a room (0170): either opens the menu for it, listed or not. */
const storefront = cache(async (slug: string, table: string | null, room: string | null) => {
  const read = async () => (await anon().rpc("dine_storefront", { p_slug: slug, p_table: table, p_room: room })).data as unknown;
  return table || room ? read() : keptMenu(slug, read, (d) => !!d).catch(() => null);
});

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string; r?: string }> }) {
  const { slug } = await params; const { t, r } = await searchParams; const data = await storefront(slug, t ?? null, r ?? null);
  const d = data as { name?: string; cuisines?: string[] } | null;
  return d ? { title: `${d.name} · book a table or order in`, description: (d.cuisines ?? []).join(", ") } : { title: "Not found" };
}
export default async function Storefront({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; t?: string; r?: string }> }) {
  const { slug } = await params; const { tab, t, r } = await searchParams;
  /* the kitchen's pace right now (0079): a pause or extra minutes, said before anyone fills a basket — read beside the
     menu and the slots, not after them (2026-10-29: one database trip fewer before the guest sees anything) */
  const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const [menu, slots, { data: busy }, { data: loyalty }] = await Promise.all([
    storefront(slug, t ?? null, r ?? null),
    keptSlots(`${slug}|${day}`, async () => { const a = await anon().rpc("dine_slots", { p_slug: slug, p_date: day, p_party: 2 }); return a.error ? null : ((a.data ?? []) as unknown[]); }, (s) => s !== null).catch(() => null),
    anon().rpc("dine_busy", { p_slug: slug }),
    anon().rpc("dine_loyalty", { p_slug: slug }),   // 0184: what the guest earns (null when the programme is off)
  ]);
  if (!menu) notFound();
  /* the pause in a kept menu may be 30 s old; the one just read is not */
  const data = busy && typeof menu === "object" ? { ...(menu as object), online_paused: !!(busy as { paused_until?: string | null }).paused_until } : menu;
  /* what Google reads: the restaurant, and which links reserve and order (Settings → Storefront →
     Bookings from Google). Not on a table-QR visit — that page is for the people at the table. */
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return (<>
    {!t && !r && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(restaurantLd(data as StoreFacts, `${base}/dine/${slug}`)) }} />}
    <StorefrontClient slug={slug} d={data as never} initialSlots={(slots ?? []) as never} tab={(tab as never) ?? "book"} tableToken={t ?? null} roomToken={r ?? null} busy={(busy ?? null) as never} loyalty={(loyalty ?? null) as never} />
  </>);
}
