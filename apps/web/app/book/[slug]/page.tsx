import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { BookClient } from "./BookClient";
export const dynamic = "force-dynamic";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const { data } = await anon().rpc("public_property", { p_slug: slug });
  return { title: data ? `Book · ${(data as { name: string }).name}` : "Book" };
}
export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await anon().rpc("public_property", { p_slug: slug });
  if (!data) notFound();
  return <BookClient slug={slug} property={data as never} />;
}
