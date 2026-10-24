/**
 * Reports as plain tables — the one description both the Excel workbook and the PDF are drawn from, so the two
 * never disagree. Money is in rupees with paise as numbers (Excel adds them up); the PDF formats them.
 */
import type { Table } from "@/lib/tablePdf";
import type { Summary } from "./ReportsClient";
import type { Breakdown } from "./Breakdown";
import { departmentTables, type Dept } from "./deptSpec";

export type Extra = {
  from: string; to: string;
  totals: { bills: number; gross: number; discount: number; service: number; cgst: number; sgst: number; round_off: number; total: number };
  payments: { method: string; count: number; amount: number }[];
  items: { name: string; variant: string | null; qty: number; amount: number }[];
  staff: { name: string; bills: number; amount: number }[];
  cancelled: { lines: number; amount: number };
  voids: { bills: number; amount: number };
  expenses: { category: string; count: number; amount: number; gst: number }[];
  net: { sales: number; expenses: number; expense_gst: number };
};

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
export const METHOD: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };
const TYPE: Record<string, string> = { dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", room_service: "Room service" };

export function reportTables(summary: Summary, breakdown: Breakdown | null, extra: Extra | null, dept: Dept | null = null, lodging = false): Table[] {
  const t: Table[] = [];
  // every department first (0140): in and out by day, then each department's rows
  if (dept) t.push(...departmentTables(dept, lodging));
  if (extra) {
    const x = extra.totals;
    t.push({ title: "Summary", head: ["", "Amount"], widths: [3, 1.4], rows: [
      ["Bills paid", n(x.bills)], ["Food & drink (before discount)", n(x.gross)], ["Discounts", n(x.discount) ? -n(x.discount) : 0], ["Service charge", n(x.service)],
      ["CGST", n(x.cgst)], ["SGST", n(x.sgst)], ["Round off", n(x.round_off)], ["Total billed", n(x.total)],
      ["Sales before tax", n(extra.net.sales)], ["Expenses before GST", n(extra.net.expenses) ? -n(extra.net.expenses) : 0], ["Sales less expenses", n(extra.net.sales - extra.net.expenses)],
      ["GST paid on expenses (input)", n(extra.net.expense_gst)], ["Cancelled lines", n(extra.cancelled.lines)], ["Cancelled value", n(extra.cancelled.amount)],
      ["Voided bills", n(extra.voids.bills)], ["Voided value", n(extra.voids.amount)],
    ] });
  }
  t.push({ title: "Sales by day", head: ["Day", "Sales"], rows: (summary.by_day ?? []).map((d) => [d.day, n(d.total)]) });
  if (extra) {
    t.push({ title: "Payments", head: ["Method", "Payments", "Amount"], rows: extra.payments.map((p) => [METHOD[p.method] ?? p.method, n(p.count), n(p.amount)]) });
    t.push({ title: "Every dish sold", head: ["Dish", "Size", "Qty", "Amount"], widths: [3, 1.4, 0.8, 1.2], right: [2, 3], rows: extra.items.map((i) => [i.name, i.variant ?? "", n(i.qty), n(i.amount)]) });
    t.push({ title: "Sales by staff", note: "who took the order", head: ["Name", "Bills", "Amount"], rows: extra.staff.map((s) => [s.name, n(s.bills), n(s.amount)]) });
    t.push({ title: "Expenses by category", head: ["Category", "Entries", "Amount", "GST in it"], rows: extra.expenses.map((e) => [e.category, n(e.count), n(e.amount), n(e.gst)]) });
  }
  if (breakdown) {
    t.push({ title: "By category", head: ["Category", "Qty", "Sales"], rows: breakdown.by_category.map((c) => [c.name, n(c.qty), n(c.rev)]) });
    t.push({ title: "By order type", head: ["Type", "Bills", "Sales"], rows: breakdown.by_type.map((c) => [TYPE[c.type] ?? c.type, n(c.bills), n(c.rev)]) });
    t.push({ title: "By hour", head: ["Hour", "Bills", "Sales"], rows: breakdown.by_hour.map((h) => [`${String(h.h).padStart(2, "0")}:00`, n(h.bills), n(h.rev)]) });
  }
  return t;
}

/** The same tables as Excel rows: a header, then the rows. */
export const toSheet = (t: Table) => ({ name: t.title, rows: [t.head, ...t.rows] });
