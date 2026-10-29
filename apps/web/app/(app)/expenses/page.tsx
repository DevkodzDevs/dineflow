import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { PageHeader } from "@/components/shell/PageHeader";
import { seesFresh, deptOf } from "@/components/shell/sections";
import { todayIST } from "@/lib/format";
import { ExpensesClient, type Expense } from "./ExpensesClient";
export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

/** expense_add and the read policy check the same list (0105). */
const CAN = ["owner", "manager", "supervisor", "cashier"];

/** What the business spends, a month at a time (`?m=2026-10`). */
export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await requireSession();
  // and since 2026-10-20 only the money teams' supervisors and cashiers (sections.ts seesFresh — the link asks the same)
  if (!CAN.includes(session.profile.role) || !seesFresh("expenses", session.profile.role, deptOf(session.profile.role, session.profile.department ?? null, session.profile.position ?? null))) redirect("/dashboard?locked=expenses");
  const { m } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(m ?? "") ? m! : todayIST().slice(0, 7);
  const [y, mo] = month.split("-").map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const s = await createClient();
  const { data: rows } = await s.from("expenses").select("id, spent_on, category, payee, amount, gst_amount, method, ref, note, created_by, created_at, voided_at, void_reason")
    .gte("spent_on", `${month}-01`).lte("spent_on", `${month}-${String(last).padStart(2, "0")}`).order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
  const ids = [...new Set((rows ?? []).map((r) => r.created_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await s.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  return (
    <>
      <PageHeader eyebrow="Money going out" title="Expenses" sub="Today's cash leaves drawer" />
      <ExpensesClient month={month} today={todayIST()} rows={(rows ?? []) as Expense[]} names={Object.fromEntries((people ?? []).map((p) => [p.id, p.full_name]))}
        canVoid={["owner", "manager"].includes(session.profile.role)} property={session.restaurant.name} />
    </>
  );
}
