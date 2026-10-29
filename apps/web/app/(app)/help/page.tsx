import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { SupportClient, type Req } from "./SupportClient";

export const metadata = { title: "Help & support" };
export const dynamic = "force-dynamic";

/**
 * Help & support — the owner raises a request with DineFlow here (since 2026-10-20; anyone else is sent to
 * /voice, Feedback & complaints, where they speak to their owner). The list is what RLS lets this person see:
 * every request of the property, including ones staff raised before. `?kind=problem&from=/orders` pre-fills the form (the error
 * screen's "Report this problem" link uses it). It lives at /help, not /support: middleware sends
 * /support to the public Contact page (ALIASES), which a signed-out visitor still needs.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  // 2026-10-20: Help & support is the owner's line to DineFlow; everyone else speaks to their owner (Feedback &
  // complaints, 0124). Master control standing in a property keeps it.
  if (session.profile.role !== "owner" && !session.isAdmin) redirect("/voice");
  const s = await createClient();
  const { data } = await s.from("support_tickets")
    .select("id, ticket_no, kind, topic, priority, status, subject, raised_by, raised_name, last_message_at, last_message_side, user_seen_at, created_at, rating")
    .order("last_message_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader eyebrow="We can help" title="Help" accent="& support"
        sub="Ask, report, suggest" />
      <SupportClient requests={(data ?? []) as Req[]} me={session.userId ?? ""} name={session.profile.full_name} role={session.profile.role}
        property={session.restaurant.name} prefill={{ kind: sp.kind ?? null, from: sp.from ?? null }} />
    </>
  );
}
