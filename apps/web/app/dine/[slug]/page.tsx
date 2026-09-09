import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { StorefrontClient } from "./StorefrontClient";
export const dynamic = "force-dynamic";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const { data } = await anon().rpc("dine_storefront", { p_slug: slug });
  const d = data as { name?: string; cuisines?: string[] } | null;
  return d ? { title: `${d.name} · book a table or order in`, description: (d.cuisines ?? []).join(", ") } : { title: "Not found" };
}
export default async function Storefront({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { slug } = await params; const { tab } = await searchParams;
  const [{ data }, { data: slots }] = await Promise.all([
    anon().rpc("dine_storefront", { p_slug: slug }),
    anon().rpc("dine_slots", { p_slug: slug, p_date: new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10), p_party: 2 }),
  ]);
  if (!data) notFound();
  return <StorefrontClient slug={slug} d={data as never} initialSlots={(slots ?? []) as never} tab={(tab as never) ?? "book"} />;
}
