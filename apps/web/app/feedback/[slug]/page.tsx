import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { FeedbackClient } from "./FeedbackClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "How was your meal?", robots: { index: false, follow: false } };
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/** From the table's QR (`?t=` is that table's code) or the printed feedback QR. Private: only the property reads it. */
export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params; const { t } = await searchParams;
  const { data } = await anon().rpc("feedback_place", { p_slug: slug, p_table: t ?? null });
  if (!data) notFound();
  return <FeedbackClient slug={slug} table={t ?? null} place={data as { name: string; logo: string | null; table: string | null }} />;
}
