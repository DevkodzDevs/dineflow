import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { RecordsClient, type Log } from "./RecordsClient";

export const metadata = { title: "Work records" };
export const dynamic = "force-dynamic";

/** Every job of a period — who raised it, who it was given to, who took it and when, who finished it and when, how long
 *  it took, by person and by department, and each cook's tickets (0116 `work_log`). The owner's and managers' own menu:
 *  the boards show each department its own work; this is the whole property's record. `?from=&to=` (IST dates). */
export default async function WorkRecordsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const session = await requireSession();
  if (!["owner", "manager"].includes(session.profile.role)) redirect("/work");
  const today = todayIST(); const sp = await searchParams;
  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && v <= today ? v : null);
  const to = ok(sp.to) ?? today; let from = ok(sp.from) ?? to; if (from > to) from = to;
  const s = await createClient();
  const { data, error } = await s.rpc("work_log", { p_from: from, p_to: to });
  return (
    <>
      <PageHeader eyebrow="Owner & managers" title="Work records" sub="Who, when, how long" />
      <RecordsClient log={(data ?? { rows: [], cooks: [] }) as Log} error={error?.message ?? null} from={from} to={to} today={today} property={session.restaurant.name} />
    </>
  );
}
