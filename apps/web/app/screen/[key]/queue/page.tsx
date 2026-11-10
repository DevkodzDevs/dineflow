import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { QueueBoard } from "./QueueBoard";
import { readBoardLang, type BoardFeed } from "@/lib/queueBoard";
export const dynamic = "force-dynamic";
export const metadata = { title: "Waiting list", robots: { index: false, follow: false } };

/** The waiting-list TV at the door (0179): the join QR, the numbers called with their table, the numbers waiting, and a
 *  voice that calls a number when the host does. Keyed like the counter TV — the same secret link from Settings →
 *  Screens & feedback; rotating it switches this screen off too. `?lang=ta` / `hi` says each call in that language and
 *  then in English. */
export default async function QueueBoardPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { key } = await params; const { lang } = await searchParams;
  if (!/^[0-9a-f]{16,64}$/.test(key)) notFound();
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await anon.rpc("screen_queue", { p_key: key });
  if (error || !data) notFound();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return <QueueBoard k={key} initial={data as BoardFeed} base={base} lang={readBoardLang(lang)} />;
}
