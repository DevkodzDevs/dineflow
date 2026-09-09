import { createClient } from "@/lib/supabase/server";
import { QueueClient } from "./QueueClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Join the queue" };
export default async function Queue({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params; const { t } = await searchParams; const s = await createClient();
  const { data: place } = await s.from("restaurants").select("name").eq("booking_slug", slug).eq("is_listed", true).maybeSingle();
  const { data: status } = t ? await s.rpc("queue_status", { p_token: t }) : { data: null };
  return <QueueClient slug={slug} name={place?.name ?? null} initial={(status as never) ?? null} />;
}
