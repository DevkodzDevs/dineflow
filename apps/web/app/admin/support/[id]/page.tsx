import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { TicketDesk, type Full } from "./TicketDesk";

export const metadata = { title: "Request · Support · Master control" };
export const dynamic = "force-dynamic";

/** One request in full for Master control (admin_support_ticket: the property, the person and how to
 *  reach them, every message and internal note, the property's other requests). Screenshots are
 *  private; each gets a signed link for the hour. */
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requireAdmin()]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await createClient();
  const { data } = await s.rpc("admin_support_ticket", { p_ticket: id });
  if (!data) notFound();
  const full = data as Full;
  const paths = full.messages.flatMap((m) => m.attachments ?? []);
  const signed = paths.length ? (await s.storage.from("support").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls: Record<string, string> = Object.fromEntries(signed.flatMap((x) => (x.signedUrl && x.path ? [[x.path, x.signedUrl] as [string, string]] : [])));
  return <TicketDesk full={full} urls={urls} />;
}
