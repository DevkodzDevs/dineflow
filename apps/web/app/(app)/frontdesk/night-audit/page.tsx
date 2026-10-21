import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { pinned } from "@/lib/scoped";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { NightAuditClient, type Audit } from "./NightAuditClient";
export const metadata = { title: "Night audit" };
export const dynamic = "force-dynamic";

/**
 * The close of a hotel's business date. It posts nothing — the folio prices every night at
 * check-out — it settles the day: who never arrived, who overstayed, which rooms the two sides of
 * the house disagree about, and the numbers the day is kept by.
 */
export default async function NightAuditPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams; const s = await createClient();
  const today = todayIST();
  const target = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today ? date : today;
  // the session is fetched alongside the figures, not in front of them — one round trip, not two
  const past = (rid?: string) => { const q = s.from("night_audits").select("business_date, occupied, rooms_sellable, occupancy_pct, adr, revpar, room_revenue, arrivals, departures, no_shows, discrepancies, notes, closed_at"); return (rid ? q.eq("restaurant_id", rid) : q).order("business_date", { ascending: false }).limit(14); };
  const [session, { data: audit, error }, all] = await Promise.all([
    requireSession(),
    s.rpc("night_audit_numbers", { p_date: target }),
    past(),
  ]);
  // the master reads every property's audits (lib/scoped.ts): only for it, ask again for this property
  const { data: history } = await pinned(session, all, past);
  if (error) console.error(`[night-audit] night_audit_numbers failed for ${target}:`, error.message);
  const canClose = ["owner", "manager", "supervisor", "frontdesk"].includes(session.profile.role);
  return (
    <>
      <PageHeader eyebrow="Front desk · close of day" title="Night" accent="audit" sub="Settle the business date before it rolls over."
        actions={<Link href="/frontdesk" className="tap text-sm font-semibold text-steel hover:text-[var(--color-label)]">← Front desk</Link>} />
      <NightAuditClient today={today} date={target} audit={(audit ?? null) as Audit | null} history={(history ?? []) as never} canClose={canClose} />
    </>
  );
}
