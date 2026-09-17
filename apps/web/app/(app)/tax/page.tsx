import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { financialYear } from "@dineflow/shared";
import { TaxClient, type Tab } from "./TaxClient";
export const metadata = { title: "Tax & GST" };
export const dynamic = "force-dynamic";

const TABS: Tab[] = ["overview", "returns", "calendar", "documents", "profile", "guide"];
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ tab?: string; month?: string; fy?: string }> }) {
  const sp = await searchParams; const s = await createClient(); const session = await requireSession();
  const today = todayIST();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const fy = /^\d{4}-\d{2}$/.test(sp.fy ?? "") ? sp.fy! : financialYear(today);
  const tab = (TABS.includes(sp.tab as Tab) ? sp.tab : "overview") as Tab;
  const [{ data: filings }, { data: docs }, { data: summary, error: sumErr }, { count: staff }] = await Promise.all([
    s.from("compliance_filings").select("*").order("due_on"),
    s.from("compliance_docs").select("*").order("kind").order("expires_on"),
    s.rpc("gst_summary", { p_from: `${month}-01`, p_to: lastDay(month) }),
    s.from("profiles").select("id", { count: "exact", head: true }).eq("restaurant_id", session.profile.restaurant_id),
  ]);
  return (
    <>
      <PageHeader eyebrow="Tax, audit & documents" title="Tax" accent="& GST" sub="What to file, when, and the numbers to file it with. Built for the Indian rules; confirm anything that matters with your CA." />
      <TaxClient tab={tab} month={month} fy={fy} today={today} restaurant={session.restaurant as never} role={session.profile.role}
        filings={(filings ?? []) as never} docs={(docs ?? []) as never} summary={(summary ?? null) as never} summaryError={sumErr?.message ?? null} staffCount={staff ?? 0} />
    </>
  );
}
