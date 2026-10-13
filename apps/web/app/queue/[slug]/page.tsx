import { createClient } from "@/lib/supabase/server";
import { QueueClient } from "./QueueClient";
export const dynamic = "force-dynamic";
export const metadata = { title: "Join the queue" };
export default async function Queue({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ t?: string }> }) {
  const { slug } = await params; const { t } = await searchParams; const s = await createClient();
  // the property's name through queue_place (0101): read straight from `restaurants`, a stranger got no row, and
  // every guest who scanned the walk-in QR was told this place is not taking a queue
  const { data: place } = await s.rpc("queue_place", { p_slug: slug });
  const { data: status } = t ? await s.rpc("queue_status", { p_token: t }) : { data: null };
  return <QueueClient slug={slug} name={(place as { name?: string } | null)?.name ?? null} initial={(status as never) ?? null} />;
}
