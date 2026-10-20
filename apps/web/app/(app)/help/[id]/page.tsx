import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { ThreadClient, type Ticket, type Msg } from "./ThreadClient";

export const metadata = { title: "Request · Help & support" };
export const dynamic = "force-dynamic";

/** One request and its thread, as the property sees it: RLS hands back the request only to the person
 *  who raised it or the property's owner and manager, and internal notes are never asked for. The
 *  screenshots are private; each gets a signed link for the hour. */
export default async function RequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, requireSession()]);
  if (session.profile.role !== "owner" && !session.isAdmin) redirect("/voice");   // the owner's line to DineFlow (2026-10-20)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await createClient();
  const [{ data: t }, { data: msgs }] = await Promise.all([
    s.from("support_tickets").select("id, ticket_no, restaurant_id, kind, topic, priority, status, subject, allow_access, due_by, rating, rating_note, raised_by, raised_name, raised_role, created_at, last_message_at, last_message_side, user_seen_at, resolved_at, context").eq("id", id).maybeSingle(),
    s.from("support_messages").select("id, side, event, body, author, author_name, attachments, created_at").eq("ticket_id", id).eq("internal", false).order("created_at"),
  ]);
  if (!t) notFound();
  const paths = (msgs ?? []).flatMap((m) => (m.attachments as string[]) ?? []);
  const signed = paths.length ? (await s.storage.from("support").createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls: Record<string, string> = Object.fromEntries(signed.flatMap((x) => (x.signedUrl && x.path ? [[x.path, x.signedUrl] as [string, string]] : [])));
  return <ThreadClient ticket={t as Ticket} messages={(msgs ?? []) as Msg[]} urls={urls} me={session.userId ?? ""} role={session.profile.role} sent={sp.sent === "1"} />;
}
