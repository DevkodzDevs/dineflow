import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { todayIST } from "@/lib/format";
import { PayrollClient, type Person, type Line, type Run, type Advance } from "./PayrollClient";
export const metadata = { title: "Payroll" };
export const dynamic = "force-dynamic";

/** The month's pay for the people who sign in (0106): rates, advances, the sheet, payslips. `?m=2026-09`; the default
 *  is last month — pay is worked out once a month is over. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await requireSession();
  if (!["owner", "manager"].includes(session.profile.role)) redirect("/dashboard?locked=payroll");
  const today = todayIST(); const { m } = await searchParams;
  const last = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(m ?? "") && (m as string) <= today.slice(0, 7) ? m! : last;
  const s = await createClient();
  const [{ data: staff }, { data: pay }, { data: adv }, { data: run }] = await Promise.all([
    s.from("profiles").select("id, full_name, role").eq("restaurant_id", session.restaurant.id).eq("is_active", true).order("full_name"),
    s.from("staff_pay").select("profile_id, basis, amount, pf_on, esi_on, pf_basic_pct"),
    s.from("staff_advances").select("id, profile_id, amount, given_on, method, note").is("recovered_in", null).order("given_on"),
    s.from("payroll_runs").select("id, month, status, pf, esi, paid_offs, wage_rule, finalised_at").eq("month", `${month}-01`).maybeSingle(),
  ]);
  const { data: lines } = run ? await s.from("payroll_lines").select("*").eq("run_id", run.id).order("name") : { data: [] };
  const r = session.restaurant;
  return (
    <>
      <PageHeader eyebrow="Staff pay" title="Payroll" sub="Days present from attendance × each person's rate, less advances — and, when switched on, PF and ESI with the employer's share. Finalise the month, pay each person, print payslips." />
      <PayrollClient month={month} today={today} property={r.name}
        settings={{ pf: !!r.payroll_pf, esi: !!r.payroll_esi, offs: Number(r.payroll_paid_offs ?? 4), rule: r.payroll_wage_rule !== false }}
        people={((staff ?? []) as { id: string; full_name: string; role: string }[]).map((p) => ({ ...p, pay: ((pay ?? []) as Person["pay"][]).find((x) => x?.profile_id === p.id) ?? null })) as Person[]}
        advances={(adv ?? []) as Advance[]} run={(run ?? null) as Run | null} lines={(lines ?? []) as Line[]} />
    </>
  );
}
