import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { SupportClient, type Req } from "./SupportClient";

export const metadata = { title: "Help & support" };
export const dynamic = "force-dynamic";

/**
 * Help & support — everyone in a property can raise a request here (no module gates it, no role).
 * The list is what RLS lets this person see: the requests they raised, or — for the owner and the
 * manager — every request of the property. `?kind=problem&from=/orders` pre-fills the form (the error
 * screen's "Report this problem" link uses it). It lives at /help, not /support: middleware sends
 * /support to the public Contact page (ALIASES), which a signed-out visitor still needs.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ kind?: string; from?: string }> }) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const s = await createClient();
  const { data } = await s.from("support_tickets")
    .select("id, ticket_no, kind, topic, priority, status, subject, raised_by, raised_name, last_message_at, last_message_side, user_seen_at, created_at, rating")
    .order("last_message_at", { ascending: false }).limit(100);
  return (
    <>
      <PageHeader eyebrow="We are here to help" title="Help" accent="& support"
        sub="Raise a complaint, report a problem, ask a question or share an idea — it goes straight to the DineFlow team, and every reply comes back here." />
      <SupportClient requests={(data ?? []) as Req[]} me={session.userId ?? ""} name={session.profile.full_name} role={session.profile.role}
        property={session.restaurant.name} prefill={{ kind: sp.kind ?? null, from: sp.from ?? null }} />
    </>
  );
}
