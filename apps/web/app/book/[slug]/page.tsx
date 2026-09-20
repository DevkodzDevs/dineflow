import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { BookClient } from "./BookClient";
export const revalidate = 60;
/**
 * Empty on purpose: there are no slugs to prerender at build time, since properties are created long
 * after a deploy. Declaring it anyway is what registers this route as cacheable-on-demand rather than
 * re-rendered per visitor — the first guest to open a property's link pays for the render and everyone
 * behind them in the next minute is served the stored copy.
 */
export function generateStaticParams() { return []; }
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/**
 * Next renders the metadata and the page in the same pass, and both want the same property. Without
 * this the guest's single visit cost two identical round trips to the database. cache() holds the
 * answer for the length of one request; nothing crosses between visitors.
 */
const property = cache(async (slug: string) => (await anon().rpc("public_property", { p_slug: slug })).data);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const data = await property(slug);
  return { title: data ? `Book · ${(data as { name: string }).name}` : "Book" };
}
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await property(slug);
  if (!data) notFound();
  return <BookClient slug={slug} property={data as never} />;
}
