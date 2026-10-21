import "server-only";
import { formatINR, modulesFor, type Role } from "@dineflow/shared";
import type { createClient } from "@/lib/supabase/server";
import type { Session } from "@/lib/auth";
import type { Table } from "@/lib/tablePdf";
import { todayIST } from "@/lib/format";

/**
 * What Assist may read, topic by topic (2026-10-21). Every topic is a fixed set of columns from this property only
 * (`restaurant_id = rid` on every query — the master's RLS sees every property), read through the person's own
 * signed-in client, so RLS still has the last word. A topic opens only for someone whose role holds its section.
 *
 * No select here names a secret: no gateway keys, webhook or export tokens, pay links, QR or punch tokens, check-in
 * links, passwords, ID numbers or login emails. `assist.test.ts` reads this file and fails if one appears.
 */
type DB = Awaited<ReturnType<typeof createClient>>;
type R = Record<string, unknown>;
export type Result = { title: string; facts: [string, string][]; tables: Table[] };
export type Range = { from: string; to: string; label: string };

export const PERIODS = ["today", "yesterday", "last_7_days", "this_month", "last_month", "last_30_days", "this_financial_year", "custom"] as const;
export type Period = (typeof PERIODS)[number];

const MAX = 2000;
const rows = async (q: PromiseLike<{ data: unknown }>) => ((await q).data ?? []) as R[];
const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (v == null ? "" : String(v));
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as R | undefined;
const sum = (xs: R[], k: string) => xs.reduce((t, x) => t + num(x[k]), 0);
const inr = (n: number) => formatINR(Math.round(n * 100) / 100);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const addDays = (d: string, k: number) => new Date(Date.parse(d + "T00:00:00Z") + k * 864e5).toISOString().slice(0, 10);
export const nice = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
const istTime = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const start = (d: string) => `${d}T00:00:00+05:30`;
const days = (r: Range) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / 864e5) + 1;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** A period in words to two IST dates, both inclusive. A bad or reversed custom range, or one over a year, falls back to this month. */
export function range(p: Period, from?: string, to?: string): Range {
  const t = todayIST(), first = t.slice(0, 7) + "-01";
  const span = (f: string, e: string, label: string) => ({ from: f, to: e, label: f === e ? `${label}${label ? ", " : ""}${nice(f)}` : `${label}${label ? ", " : ""}${nice(f)} – ${nice(e)}` });
  switch (p) {
    case "today": return span(t, t, "Today");
    case "yesterday": return span(addDays(t, -1), addDays(t, -1), "Yesterday");
    case "last_7_days": return span(addDays(t, -6), t, "Last 7 days");
    case "last_30_days": return span(addDays(t, -29), t, "Last 30 days");
    case "last_month": { const end = addDays(first, -1); return span(end.slice(0, 7) + "-01", end, "Last month"); }
    case "this_financial_year": { const y = Number(t.slice(0, 4)) - (Number(t.slice(5, 7)) < 4 ? 1 : 0); return span(`${y}-04-01`, t, `Financial year ${y}–${String(y + 1).slice(2)}`); }
    case "custom": {
      const ok = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
      if (ok(from) && ok(to) && from! <= to! && Date.parse(to!) - Date.parse(from!) <= 366 * 864e5) return span(from!, to!, "");
      return span(first, t, "This month");
    }
    default: return span(first, t, "This month");
  }
}

export const modulesOf = (s: Session) => modulesFor(s.restaurant.property_type, s.profile.role, s.restaurant.enabled_modules ?? null, s.profile.allowed_modules ?? null);
/**
 * Which parts of the house a person's sections reach (2026-10-21). The snapshot below runs on every screen change and
 * every 90 s for every login; it used to read bills, kitchen tickets, stock, tables, the queue and rooms for everyone —
 * a housekeeper's phone asked for the day's takings eight times an hour. Now each part is read only for someone whose
 * sections show it: the owner and a manager still get the whole house, a housekeeper only rooms.
 */
export const reach = (m: string[]) => {
  const has = (...k: string[]) => k.some((x) => m.includes(x));
  return { money: has("billing", "reports"), kitchen: has("kitchen", "orders"), stock: has("inventory"), floor: has("orders", "pulse"), queue: has("pulse"), rooms: has("housekeeping", "rooms", "frontdesk") };
};
const BOSS: Role[] = ["owner", "manager"];
const any = (...want: string[]) => (m: string[]) => want.some((w) => m.includes(w));

type Ctx = { s: DB; rid: string; r: Range; session: Session };
type Topic = { label: string; about: string; may: (mods: string[], role: Role) => boolean; run: (c: Ctx) => Promise<Result> };

export const TOPICS = {
  collections: {
    label: "Collections", about: "money received: bills paid, by cash / UPI / card, GST collected, discounts, voids, day by day",
    may: any("billing", "reports", "invoices"),
    run: async ({ s, rid, r }) => {
      const lo = start(r.from), hi = start(addDays(r.to, 1));
      const [paid, voids, pays] = await Promise.all([
        rows(s.from("bills").select("id, bill_no, subtotal, discount_amount, service_charge, cgst, sgst, total, paid_at").eq("restaurant_id", rid).eq("status", "paid").gte("paid_at", lo).lt("paid_at", hi).order("paid_at").limit(MAX)),
        rows(s.from("bills").select("bill_no, total, void_reason, voided_at").eq("restaurant_id", rid).eq("status", "void").gte("created_at", lo).lt("created_at", hi).limit(MAX)),
        rows(s.from("payments").select("bill_id, method, amount, created_at").eq("restaurant_id", rid).gte("created_at", lo).lt("created_at", hi).limit(MAX * 2)),
      ]);
      const by: Record<string, number> = { cash: 0, upi: 0, card: 0, other: 0 };
      const perDay = new Map<string, Record<string, number>>(); const methodOf = new Map<string, Set<string>>();
      for (const p of pays) {
        const m = str(p.method) in by ? str(p.method) : "other"; by[m] += num(p.amount);
        const d = istDay(str(p.created_at)); const row = perDay.get(d) ?? { cash: 0, upi: 0, card: 0, other: 0, bills: 0 }; row[m] += num(p.amount); perDay.set(d, row);
        const set = methodOf.get(str(p.bill_id)) ?? new Set(); set.add(m.toUpperCase()); methodOf.set(str(p.bill_id), set);
      }
      for (const b of paid) { const d = istDay(str(b.paid_at)); const row = perDay.get(d) ?? { cash: 0, upi: 0, card: 0, other: 0, bills: 0 }; row.bills += 1; perDay.set(d, row); }
      const total = sum(paid, "total"), gst = sum(paid, "cgst") + sum(paid, "sgst");
      return {
        title: "Collections",
        facts: [["Collected", inr(total)], ["Bills paid", String(paid.length)], ["Average bill", paid.length ? inr(total / paid.length) : "—"], ["Cash", inr(by.cash)], ["UPI", inr(by.upi)], ["Card", inr(by.card)], ["Other", inr(by.other)], ["GST collected (CGST + SGST)", inr(gst)], ["Discounts given", inr(sum(paid, "discount_amount"))], ["Service charge", inr(sum(paid, "service_charge"))], ["Bills voided", `${voids.length} (${inr(sum(voids, "total"))})`]],
        tables: [
          { title: "Day by day", head: ["Date", "Bills", "Cash", "UPI", "Card", "Other", "Total (Rs)"], widths: [2, 1, 1.4, 1.4, 1.4, 1.2, 1.6],
            rows: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, x]) => [nice(d), x.bills, r2(x.cash), r2(x.upi), r2(x.card), r2(x.other), r2(x.cash + x.upi + x.card + x.other)]) },
          { title: "Bills paid", head: ["Bill", "Paid at", "Subtotal", "Discount", "GST", "Total (Rs)", "Paid by"], widths: [1, 2, 1.4, 1.2, 1.2, 1.5, 1.4], right: [2, 3, 4, 5],
            rows: paid.map((b) => [`#${b.bill_no}`, istTime(b.paid_at), r2(num(b.subtotal)), r2(num(b.discount_amount)), r2(num(b.cgst) + num(b.sgst)), r2(num(b.total)), [...(methodOf.get(str(b.id)) ?? [])].join(" + ")]) },
          ...(voids.length ? [{ title: "Voided bills", head: ["Bill", "Voided", "Amount (Rs)", "Reason"], widths: [1, 2, 1.4, 4], right: [2], rows: voids.map((v) => [`#${v.bill_no}`, istTime(v.voided_at), r2(num(v.total)), str(v.void_reason)]) }] : []),
        ],
      };
    },
  },
  expenses: {
    label: "Expenses", about: "money spent: every expense by category, payee and method",
    may: (_m, role) => ["owner", "manager", "supervisor", "cashier"].includes(role),
    run: async ({ s, rid, r }) => {
      const ex = await rows(s.from("expenses").select("spent_on, category, payee, amount, gst_amount, method, note").eq("restaurant_id", rid).is("voided_at", null).gte("spent_on", r.from).lte("spent_on", r.to).order("spent_on").limit(MAX));
      const cat = new Map<string, [number, number]>(); for (const e of ex) { const c = str(e.category) || "Other"; const v = cat.get(c) ?? [0, 0]; cat.set(c, [v[0] + 1, v[1] + num(e.amount)]); }
      const total = sum(ex, "amount");
      return {
        title: "Expenses",
        facts: [["Spent", inr(total)], ["Entries", String(ex.length)], ["GST paid on expenses", inr(sum(ex, "gst_amount"))], ["Biggest category", [...cat.entries()].sort((a, b) => b[1][1] - a[1][1])[0]?.[0] ?? "—"]],
        tables: [
          { title: "By category", head: ["Category", "Entries", "Amount (Rs)", "Share"], widths: [3, 1, 1.6, 1], rows: [...cat.entries()].sort((a, b) => b[1][1] - a[1][1]).map(([c, [k, v]]) => [c, k, r2(v), pct(v, total)]) },
          { title: "Every expense", head: ["Date", "Category", "Paid to", "Method", "GST", "Amount (Rs)"], widths: [1.5, 1.8, 2.6, 1, 1, 1.4], right: [4, 5], rows: ex.map((e) => [nice(str(e.spent_on)), str(e.category), str(e.payee), str(e.method).toUpperCase(), r2(num(e.gst_amount)), r2(num(e.amount))]) },
        ],
      };
    },
  },
  staff: {
    label: "Staff", about: "the team: names, roles, departments, phone, joining date, attendance and leave in the period (no pay — that is payroll)",
    may: any("staff"),
    run: async ({ s, rid, r }) => {
      const [team, att, leave] = await Promise.all([
        rows(s.from("profiles").select("id, full_name, display_name, role, position_title, department, phone, joined_on, is_active, staff_code").eq("restaurant_id", rid).order("full_name").limit(MAX)),
        rows(s.from("staff_attendance").select("profile_id, work_date, hours").eq("restaurant_id", rid).gte("work_date", r.from).lte("work_date", r.to).limit(MAX * 4)),
        rows(s.from("staff_leave").select("profile_id, from_date, to_date, days, kind, status").eq("restaurant_id", rid).eq("status", "approved").lte("from_date", r.to).gte("to_date", r.from).limit(MAX)),
      ]);
      const present = new Map<string, Set<string>>(), hours = new Map<string, number>(), off = new Map<string, number>();
      for (const a of att) { const k = str(a.profile_id); (present.get(k) ?? present.set(k, new Set()).get(k)!).add(str(a.work_date)); hours.set(k, (hours.get(k) ?? 0) + num(a.hours)); }
      for (const l of leave) off.set(str(l.profile_id), (off.get(str(l.profile_id)) ?? 0) + num(l.days));
      const active = team.filter((t) => t.is_active !== false);
      const dept = new Map<string, number>(); for (const t of active) dept.set(str(t.department) || "Unassigned", (dept.get(str(t.department) || "Unassigned") ?? 0) + 1);
      return {
        title: "Staff",
        facts: [["Active staff", String(active.length)], ["Inactive", String(team.length - active.length)], ["Days in period", String(days(r))], ["Attendance marks", String(att.length)], ["Approved leave days", String(r2([...off.values()].reduce((a, b) => a + b, 0)))], ["Departments", [...dept.entries()].map(([d, k]) => `${d} ${k}`).join(", ") || "—"]],
        tables: [
          { title: "The team", head: ["Code", "Name", "Role / position", "Department", "Phone", "Joined", "Status"], widths: [0.9, 2.2, 2.2, 1.5, 1.6, 1.3, 1], right: [],
            rows: team.map((t) => [str(t.staff_code), str(t.display_name || t.full_name), str(t.position_title || t.role), str(t.department), str(t.phone), t.joined_on ? nice(str(t.joined_on)) : "", t.is_active === false ? "Inactive" : "Active"]) },
          { title: "Attendance in the period", head: ["Name", "Days present", "Hours", "Leave days"], widths: [3, 1.3, 1.3, 1.3],
            rows: active.map((t) => [str(t.display_name || t.full_name), present.get(str(t.id))?.size ?? 0, r2(hours.get(str(t.id)) ?? 0), off.get(str(t.id)) ?? 0]) },
        ],
      };
    },
  },
  payroll: {
    label: "Payroll", about: "salaries: each person's paid days, gross, PF/ESI, advances and net for the months in the period (owner and manager only)",
    may: (_m, role) => BOSS.includes(role),
    run: async ({ s, rid, r }) => {
      const runs = await rows(s.from("payroll_runs").select("id, month, status").eq("restaurant_id", rid).gte("month", r.from.slice(0, 7) + "-01").lte("month", r.to).order("month"));
      const lines = runs.length ? await rows(s.from("payroll_lines").select("run_id, name, role, paid_days, gross, bonus, pf_employee, esi_employee, advances, other_deduction, net, paid_at, paid_method").eq("restaurant_id", rid).in("run_id", runs.map((x) => str(x.id))).order("name")) : [];
      const month = (id: string) => { const m = str(runs.find((x) => str(x.id) === id)?.month); return m ? new Date(m + "T00:00:00Z").toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) : ""; };
      return {
        title: "Payroll",
        facts: [["Pay runs", runs.map((x) => `${month(str(x.id))} (${str(x.status)})`).join(", ") || "None in this period"], ["Gross", inr(sum(lines, "gross") + sum(lines, "bonus"))], ["PF + ESI (staff share)", inr(sum(lines, "pf_employee") + sum(lines, "esi_employee"))], ["Advances recovered", inr(sum(lines, "advances"))], ["Net pay", inr(sum(lines, "net"))], ["Paid out", `${lines.filter((l) => l.paid_at).length} of ${lines.length}`]],
        tables: [{ title: "Pay lines", head: ["Month", "Name", "Role", "Paid days", "Gross", "PF+ESI", "Advances", "Net (Rs)", "Paid"], widths: [1.1, 2, 1.3, 0.9, 1.2, 1, 1, 1.2, 1], right: [3, 4, 5, 6, 7],
          rows: lines.map((l) => [month(str(l.run_id)), str(l.name), str(l.role), num(l.paid_days), r2(num(l.gross) + num(l.bonus)), r2(num(l.pf_employee) + num(l.esi_employee)), r2(num(l.advances)), r2(num(l.net)), l.paid_at ? str(l.paid_method || "yes") : "not yet"]) }],
      };
    },
  },
  pantry: {
    label: "Pantry", about: "stock: every ingredient's quantity, reorder level and value, what is low, stock movements and purchase orders in the period",
    may: any("inventory"),
    run: async ({ s, rid, r }) => {
      const lo = start(r.from), hi = start(addDays(r.to, 1));
      const [ing, led, pos] = await Promise.all([
        rows(s.from("ingredients").select("id, name, category, unit, current_stock, reorder_level, cost_per_unit").eq("restaurant_id", rid).eq("is_active", true).order("name").limit(MAX)),
        rows(s.from("stock_ledger").select("ingredient_id, qty, reason, unit_cost").eq("restaurant_id", rid).gte("created_at", lo).lt("created_at", hi).limit(MAX * 5)),
        rows(s.from("purchase_orders").select("po_no, status, total, expected_on, created_at, received_at, suppliers(name)").eq("restaurant_id", rid).gte("created_at", lo).lt("created_at", hi).order("created_at").limit(MAX)),
      ]);
      const cost = new Map(ing.map((i) => [str(i.id), num(i.cost_per_unit)]));
      const moves = new Map<string, [number, number]>(); for (const l of led) { const k = str(l.reason); const v = moves.get(k) ?? [0, 0]; moves.set(k, [v[0] + 1, v[1] + Math.abs(num(l.qty)) * (num(l.unit_cost) || cost.get(str(l.ingredient_id)) || 0)]); }
      const low = ing.filter((i) => num(i.current_stock) <= num(i.reorder_level));
      const value = ing.reduce((t, i) => t + Math.max(0, num(i.current_stock)) * num(i.cost_per_unit), 0);
      return {
        title: "Pantry",
        facts: [["Ingredients", String(ing.length)], ["Stock value now", inr(value)], ["At or below reorder", `${low.length}${low.length ? ` — ${low.slice(0, 6).map((i) => str(i.name)).join(", ")}${low.length > 6 ? "…" : ""}` : ""}`], ["Below zero", String(ing.filter((i) => num(i.current_stock) < 0).length)], ["Purchased in period", inr(moves.get("purchase")?.[1] ?? 0)], ["Wasted in period", inr(moves.get("wastage")?.[1] ?? 0)], ["Purchase orders", String(pos.length)]],
        tables: [
          { title: "Stock now", head: ["Ingredient", "Category", "Unit", "In stock", "Reorder at", "Cost/unit", "Value (Rs)", ""], widths: [2.6, 1.4, 0.7, 1.1, 1.1, 1.1, 1.3, 0.8], right: [3, 4, 5, 6],
            rows: ing.map((i) => [str(i.name), str(i.category), str(i.unit), r2(num(i.current_stock)), r2(num(i.reorder_level)), r2(num(i.cost_per_unit)), r2(Math.max(0, num(i.current_stock)) * num(i.cost_per_unit)), num(i.current_stock) <= num(i.reorder_level) ? "LOW" : ""]) },
          { title: "Stock movements in the period", head: ["Kind", "Entries", "Value at cost (Rs)"], widths: [3, 1, 2], rows: [...moves.entries()].map(([k, [c, v]]) => [k[0].toUpperCase() + k.slice(1), c, r2(v)]) },
          { title: "Purchase orders", head: ["PO", "Supplier", "Status", "Raised", "Expected", "Total (Rs)"], widths: [0.8, 2.6, 1.2, 1.4, 1.4, 1.3], right: [5],
            rows: pos.map((p) => [`#${p.po_no}`, str(one(p.suppliers)?.name), str(p.status), istTime(p.created_at), p.expected_on ? nice(str(p.expected_on)) : "", r2(num(p.total))]) },
        ],
      };
    },
  },
  rooms: {
    label: "Rooms & stays", about: "rooms by type, status and condition now; every stay overlapping the period with guest, nights, rate; occupancy, average rate and room revenue",
    may: any("rooms", "frontdesk", "housekeeping"),
    run: async ({ s, rid, r }) => {
      const [rm, bk] = await Promise.all([
        rows(s.from("rooms").select("id, number, floor, status, condition, room_types(name, base_rate)").eq("restaurant_id", rid).order("sort_order").limit(MAX)),
        rows(s.from("bookings").select("booking_no, check_in, check_out, rate, status, source, advance, adults, children, is_block, guests(full_name, phone), rooms(number)").eq("restaurant_id", rid).lte("check_in", r.to).gt("check_out", r.from).not("status", "in", "(cancelled,no_show)").order("check_in").limit(MAX)),
      ]);
      const stays = bk.filter((b) => !b.is_block);
      const overlap = (b: R) => Math.max(0, Math.round((Math.min(Date.parse(addDays(r.to, 1)), Date.parse(str(b.check_out))) - Math.max(Date.parse(r.from), Date.parse(str(b.check_in)))) / 864e5));
      const nights = stays.reduce((t, b) => t + overlap(b), 0), revenue = stays.reduce((t, b) => t + overlap(b) * num(b.rate), 0);
      const status = new Map<string, number>(); for (const x of rm) status.set(str(x.status), (status.get(str(x.status)) ?? 0) + 1);
      return {
        title: "Rooms & stays",
        facts: [["Rooms", String(rm.length)], ["Now", [...status.entries()].map(([k, v]) => `${k} ${v}`).join(", ") || "—"], ["Stays in period", String(stays.length)], ["Room-nights sold", String(nights)], ["Occupancy", pct(nights, rm.length * days(r))], ["Average rate", nights ? inr(revenue / nights) : "—"], ["Room revenue (rate x nights)", inr(revenue)]],
        tables: [
          { title: "Rooms", head: ["Room", "Floor", "Type", "Base rate", "Status", "Condition"], widths: [1, 0.8, 2.2, 1.2, 1.4, 1.2], right: [3],
            rows: rm.map((x) => [str(x.number), str(x.floor), str(one(x.room_types)?.name), r2(num(one(x.room_types)?.base_rate)), str(x.status), str(x.condition)]) },
          { title: "Stays", head: ["#", "Guest", "Phone", "Room", "In", "Out", "Nights", "Rate", "Status", "Source"], widths: [0.7, 2, 1.5, 0.8, 1.2, 1.2, 0.8, 1, 1.2, 1.1], right: [6, 7],
            rows: stays.map((b) => [str(b.booking_no), str(one(b.guests)?.full_name), str(one(b.guests)?.phone), str(one(b.rooms)?.number), nice(str(b.check_in)), nice(str(b.check_out)), Math.round((Date.parse(str(b.check_out)) - Date.parse(str(b.check_in))) / 864e5), r2(num(b.rate)), str(b.status).replace("_", " "), str(b.source)]) },
        ],
      };
    },
  },
  menu: {
    label: "Menu", about: "every dish with category, price, veg, availability, and how many sold and for how much in the period",
    may: any("menu"),
    run: async ({ s, rid, r }) => {
      const [items, sold] = await Promise.all([
        rows(s.from("menu_items").select("id, name, price, is_veg, is_available, prep_minutes, categories(name)").eq("restaurant_id", rid).eq("is_active", true).order("name").limit(MAX)),
        rows(s.from("order_items").select("menu_item_id, name_snapshot, qty, price_snapshot").eq("restaurant_id", rid).neq("status", "cancelled").gte("created_at", start(r.from)).lt("created_at", start(addDays(r.to, 1))).limit(MAX * 10)),
      ]);
      const by = new Map<string, [number, number]>(); for (const o of sold) { const k = str(o.menu_item_id) || str(o.name_snapshot); const v = by.get(k) ?? [0, 0]; by.set(k, [v[0] + num(o.qty), v[1] + num(o.qty) * num(o.price_snapshot)]); }
      const list = items.map((i) => ({ i, q: by.get(str(i.id))?.[0] ?? 0, v: by.get(str(i.id))?.[1] ?? 0 }));
      const top = [...list].sort((a, b) => b.v - a.v).filter((x) => x.q > 0);
      return {
        title: "Menu",
        facts: [["Dishes", String(items.length)], ["Available now", String(items.filter((i) => i.is_available).length)], ["Veg", String(items.filter((i) => i.is_veg).length)], ["Dishes sold in period", String(sold.reduce((t, o) => t + num(o.qty), 0))], ["Best seller", top[0] ? `${str(top[0].i.name)} (${top[0].q} sold, ${inr(top[0].v)})` : "—"], ["Not sold once", String(list.filter((x) => x.q === 0).length)]],
        tables: [
          { title: "Top sellers", head: ["Dish", "Sold", "Sales (Rs)"], widths: [3, 1, 1.4], rows: top.slice(0, 15).map((x) => [str(x.i.name), x.q, r2(x.v)]) },
          { title: "Every dish", head: ["Category", "Dish", "Veg", "Price", "Available", "Sold", "Sales (Rs)"], widths: [1.6, 2.6, 0.7, 1, 1, 0.8, 1.2], right: [3, 5, 6],
            rows: list.sort((a, b) => str(one(a.i.categories)?.name).localeCompare(str(one(b.i.categories)?.name)) || str(a.i.name).localeCompare(str(b.i.name))).map((x) => [str(one(x.i.categories)?.name), str(x.i.name), x.i.is_veg ? "Veg" : "Non-veg", r2(num(x.i.price)), x.i.is_available ? "Yes" : "No", x.q, r2(x.v)]) },
        ],
      };
    },
  },
  orders: {
    label: "Orders", about: "orders taken in the period by type (dine-in, takeaway, delivery) and status, day by day, and every cancellation with its reason",
    may: any("orders"),
    run: async ({ s, rid, r }) => {
      const os = await rows(s.from("orders").select("order_no, type, status, created_at, cancel_reason, dining_tables(name)").eq("restaurant_id", rid).gte("created_at", start(r.from)).lt("created_at", start(addDays(r.to, 1))).order("created_at").limit(MAX * 2));
      const per = new Map<string, Record<string, number>>(); for (const o of os) { const d = istDay(str(o.created_at)); const v = per.get(d) ?? { dine_in: 0, takeaway: 0, delivery: 0, cancelled: 0 }; if (o.status === "cancelled") v.cancelled++; else v[str(o.type)] = (v[str(o.type)] ?? 0) + 1; per.set(d, v); }
      const k = (t: string) => os.filter((o) => o.type === t && o.status !== "cancelled").length; const cancelled = os.filter((o) => o.status === "cancelled");
      return {
        title: "Orders",
        facts: [["Orders", String(os.length - cancelled.length)], ["Dine-in", String(k("dine_in"))], ["Takeaway", String(k("takeaway"))], ["Delivery", String(k("delivery"))], ["Still open", String(os.filter((o) => o.status === "open").length)], ["Cancelled", String(cancelled.length)]],
        tables: [
          { title: "Day by day", head: ["Date", "Dine-in", "Takeaway", "Delivery", "Cancelled"], widths: [2, 1, 1, 1, 1], rows: [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => [nice(d), v.dine_in, v.takeaway, v.delivery, v.cancelled]) },
          ...(cancelled.length ? [{ title: "Cancelled orders", head: ["Order", "When", "Type", "Table", "Reason"], widths: [0.9, 1.6, 1.1, 1, 4], right: [], rows: cancelled.map((o) => [`#${o.order_no}`, istTime(o.created_at), str(o.type).replace("_", "-"), str(one(o.dining_tables)?.name), str(o.cancel_reason)]) }] : []),
        ],
      };
    },
  },
  customers: {
    label: "Customers", about: "dining customers: the top spenders, visits, loyalty points, and how many were new in the period",
    may: any("customers"),
    run: async ({ s, rid, r }) => {
      const [top, fresh, all] = await Promise.all([
        rows(s.from("customers").select("name, phone, visits, total_spend, points, last_visit_at").eq("restaurant_id", rid).order("total_spend", { ascending: false }).limit(200)),
        s.from("customers").select("id", { count: "exact", head: true }).eq("restaurant_id", rid).gte("first_visit_at", start(r.from)).lt("first_visit_at", start(addDays(r.to, 1))),
        s.from("customers").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
      ]);
      return {
        title: "Customers",
        facts: [["Customers on file", String(all.count ?? 0)], ["New in period", String(fresh.count ?? 0)], ["Top customer", top[0] ? `${str(top[0].name) || str(top[0].phone)} (${inr(num(top[0].total_spend))})` : "—"]],
        tables: [{ title: "Top customers by spend", head: ["Name", "Phone", "Visits", "Spent (Rs)", "Points", "Last visit"], widths: [2.4, 1.6, 0.8, 1.3, 0.9, 1.5], right: [2, 3, 4],
          rows: top.map((c) => [str(c.name), str(c.phone), num(c.visits), r2(num(c.total_spend)), r2(num(c.points)), c.last_visit_at ? istTime(c.last_visit_at) : ""]) }],
      };
    },
  },
  reservations: {
    label: "Table reservations", about: "table bookings in the period: guest, party size, time, occasion and what happened (seated, no-show, cancelled)",
    may: any("reservations"),
    run: async ({ s, rid, r }) => {
      const rs = await rows(s.from("reservations").select("reservation_no, on_date, at_time, guest_name, guest_phone, party_size, occasion, status, source").eq("restaurant_id", rid).gte("on_date", r.from).lte("on_date", r.to).order("on_date").order("at_time").limit(MAX));
      const k = (st: string) => rs.filter((x) => x.status === st).length;
      return {
        title: "Table reservations",
        facts: [["Reservations", String(rs.length)], ["Guests booked", String(sum(rs, "party_size"))], ["Seated or completed", String(k("seated") + k("completed"))], ["No-shows", String(k("no_show"))], ["Cancelled", String(k("cancelled"))], ["No-show rate", pct(k("no_show"), rs.length)]],
        tables: [{ title: "Reservations", head: ["#", "Date", "Time", "Guest", "Phone", "Party", "Occasion", "Status"], widths: [0.6, 1.3, 0.8, 2, 1.5, 0.7, 1.4, 1.1], right: [5],
          rows: rs.map((x) => [str(x.reservation_no), nice(str(x.on_date)), str(x.at_time).slice(0, 5), str(x.guest_name), str(x.guest_phone), num(x.party_size), str(x.occasion), str(x.status).replace("_", "-")]) }],
      };
    },
  },
  labour: {
    label: "Daily labour", about: "daily-wage workers: who worked how many days, wages earned, paid and still owed in the period",
    may: any("labour"),
    run: async ({ s, rid, r }) => {
      const [ls, att, pay] = await Promise.all([
        rows(s.from("labourers").select("id, code, full_name, phone, skill, daily_wage, status").eq("restaurant_id", rid).order("full_name").limit(MAX)),
        rows(s.from("labour_attendance").select("labourer_id, work_date, hours, wage").eq("restaurant_id", rid).gte("work_date", r.from).lte("work_date", r.to).limit(MAX * 4)),
        rows(s.from("labour_payments").select("labourer_id, amount").eq("restaurant_id", rid).gte("created_at", start(r.from)).lt("created_at", start(addDays(r.to, 1))).limit(MAX)),
      ]);
      const per = (xs: R[], k: string, id: string) => xs.filter((x) => str(x.labourer_id) === id).reduce((t, x) => t + num(x[k]), 0);
      const list = ls.map((l) => { const id = str(l.id); const earned = per(att, "wage", id), paid = per(pay, "amount", id); return { l, d: att.filter((a) => str(a.labourer_id) === id).length, earned, paid }; }).filter((x) => x.d || x.paid || x.l.status === "active");
      return {
        title: "Daily labour",
        facts: [["Workers", String(ls.filter((l) => l.status === "active").length)], ["Worker-days", String(att.length)], ["Wages earned", inr(sum(att, "wage"))], ["Paid", inr(sum(pay, "amount"))], ["Still owed", inr(Math.max(0, sum(att, "wage") - sum(pay, "amount")))]],
        tables: [{ title: "Workers", head: ["Code", "Name", "Skill", "Wage/day", "Days", "Earned", "Paid", "Owed (Rs)"], widths: [0.8, 2.2, 1.4, 1, 0.7, 1.1, 1.1, 1.1], right: [3, 4, 5, 6, 7],
          rows: list.map((x) => [str(x.l.code), str(x.l.full_name), str(x.l.skill), r2(num(x.l.daily_wage)), x.d, r2(x.earned), r2(x.paid), r2(Math.max(0, x.earned - x.paid))]) }],
      };
    },
  },
  housekeeping: {
    label: "Housekeeping", about: "room cleaning tasks in the period: room, kind, status, who did it, how long it took",
    may: any("housekeeping", "rooms"),
    run: async ({ s, rid, r }) => {
      const [ts, team] = await Promise.all([
        rows(s.from("housekeeping_tasks").select("kind, status, place, created_at, done_at, done_by, assigned_to, rooms(number)").eq("restaurant_id", rid).gte("created_at", start(r.from)).lt("created_at", start(addDays(r.to, 1))).order("created_at").limit(MAX)),
        rows(s.from("profiles").select("id, full_name, display_name").eq("restaurant_id", rid).limit(MAX)),
      ]);
      const name = new Map(team.map((t) => [str(t.id), str(t.display_name || t.full_name)]));
      const done = ts.filter((t) => t.status === "done" && t.done_at); const mins = done.map((t) => (Date.parse(str(t.done_at)) - Date.parse(str(t.created_at))) / 60000);
      return {
        title: "Housekeeping",
        facts: [["Tasks", String(ts.length)], ["Done", String(done.length)], ["Still open", String(ts.length - done.length)], ["Average time to done", mins.length ? `${Math.round(mins.reduce((a, b) => a + b, 0) / mins.length)} min` : "—"]],
        tables: [{ title: "Tasks", head: ["Room / place", "Task", "Status", "Raised", "Done", "Minutes", "By"], widths: [1.3, 1.3, 1.1, 1.5, 1.5, 0.9, 1.8], right: [5],
          rows: ts.map((t) => [str(one(t.rooms)?.number || t.place), str(t.kind), str(t.status).replace("_", " "), istTime(t.created_at), istTime(t.done_at), t.done_at ? Math.round((Date.parse(str(t.done_at)) - Date.parse(str(t.created_at))) / 60000) : "", name.get(str(t.done_by || t.assigned_to)) ?? ""]) }],
      };
    },
  },
  online: {
    label: "Online orders", about: "Swiggy / Zomato / website orders in the period by channel: gross, commission, payout, and rejections",
    may: any("online-orders"),
    run: async ({ s, rid, r }) => {
      const [os, ch] = await Promise.all([
        rows(s.from("online_orders").select("display_id, status, gross, commission, payout, placed_at, customer_name, channel_id").eq("restaurant_id", rid).gte("placed_at", start(r.from)).lt("placed_at", start(addDays(r.to, 1))).order("placed_at").limit(MAX)),
        rows(s.from("order_channels").select("id, label, kind").eq("restaurant_id", rid)),
      ]);
      const label = new Map(ch.map((c) => [str(c.id), str(c.label || c.kind)]));
      const live = os.filter((o) => !["rejected", "cancelled"].includes(str(o.status)));
      const per = new Map<string, number[]>(); for (const o of live) { const k = label.get(str(o.channel_id)) ?? "Direct"; const v = per.get(k) ?? [0, 0, 0, 0]; per.set(k, [v[0] + 1, v[1] + num(o.gross), v[2] + num(o.commission), v[3] + num(o.payout)]); }
      return {
        title: "Online orders",
        facts: [["Orders", String(live.length)], ["Gross", inr(sum(live, "gross"))], ["Commission", inr(sum(live, "commission"))], ["Payout", inr(sum(live, "payout"))], ["Rejected or cancelled", String(os.length - live.length)]],
        tables: [
          { title: "By channel", head: ["Channel", "Orders", "Gross", "Commission", "Payout (Rs)"], widths: [2.4, 1, 1.4, 1.4, 1.4], rows: [...per.entries()].map(([k, v]) => [k, v[0], r2(v[1]), r2(v[2]), r2(v[3])]) },
          { title: "Every order", head: ["Order", "Channel", "Placed", "Customer", "Status", "Gross (Rs)"], widths: [1.2, 1.5, 1.5, 2, 1.1, 1.2], right: [5], rows: os.map((o) => [str(o.display_id), label.get(str(o.channel_id)) ?? "", istTime(o.placed_at), str(o.customer_name), str(o.status).replace("_", " "), r2(num(o.gross))]) },
        ],
      };
    },
  },
  tables: {
    label: "Dining tables", about: "every dining table: zone, seats, status now, open order on it, and tables waiting to be cleaned",
    may: any("orders"),
    run: async ({ s, rid }) => {
      const [tb, open, clean] = await Promise.all([
        rows(s.from("dining_tables").select("id, name, zone, capacity, status").eq("restaurant_id", rid).order("sort_order").limit(MAX)),
        rows(s.from("orders").select("order_no, table_id, created_at").eq("restaurant_id", rid).eq("status", "open").not("table_id", "is", null)),
        rows(s.from("table_cleanings").select("table_id, status").eq("restaurant_id", rid).neq("status", "done")),
      ]);
      const on = new Map(open.map((o) => [str(o.table_id), o])); const dirty = new Set(clean.map((c) => str(c.table_id)));
      return {
        title: "Dining tables",
        facts: [["Tables", String(tb.length)], ["Seats", String(sum(tb, "capacity"))], ["With an open order", String(tb.filter((t) => on.has(str(t.id))).length)], ["Waiting to be cleaned", String(tb.filter((t) => dirty.has(str(t.id))).length)]],
        tables: [{ title: "Tables now", head: ["Table", "Zone", "Seats", "Status", "Open order", "Since", "Cleaning"], widths: [1.2, 1.4, 0.8, 1.1, 1.1, 1.6, 1], right: [2],
          rows: tb.map((t) => { const o = on.get(str(t.id)); return [str(t.name), str(t.zone), num(t.capacity), str(t.status), o ? `#${o.order_no}` : "", o ? istTime(o.created_at) : "", dirty.has(str(t.id)) ? "pending" : ""]; }) }],
      };
    },
  },
  kitchen: {
    label: "Kitchen speed", about: "kitchen tickets (KOTs) in the period: how many, average minutes to ready, how many ran late, day by day",
    may: any("kitchen"),
    run: async ({ s, rid, r }) => {
      const ks = await rows(s.from("kots").select("kot_no, status, created_at, ready_at").eq("restaurant_id", rid).gte("created_at", start(r.from)).lt("created_at", start(addDays(r.to, 1))).limit(MAX * 3));
      const m = (k: R) => (k.ready_at ? (Date.parse(str(k.ready_at)) - Date.parse(str(k.created_at))) / 60000 : null);
      const per = new Map<string, number[]>(); for (const k of ks) { const d = istDay(str(k.created_at)); const v = per.get(d) ?? [0, 0, 0, 0]; const x = m(k); per.set(d, [v[0] + 1, v[1] + (x ?? 0), v[2] + (x === null ? 0 : 1), v[3] + (x !== null && x > 15 ? 1 : 0)]); }
      const timed = ks.map(m).filter((x): x is number => x !== null);
      return {
        title: "Kitchen speed",
        facts: [["Tickets", String(ks.length)], ["Average minutes to ready", timed.length ? String(Math.round(timed.reduce((a, b) => a + b, 0) / timed.length)) : "—"], ["Over 15 minutes", `${timed.filter((x) => x > 15).length} (${pct(timed.filter((x) => x > 15).length, timed.length)})`]],
        tables: [{ title: "Day by day", head: ["Date", "Tickets", "Avg minutes", "Over 15 min"], widths: [2, 1, 1, 1], rows: [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => [nice(d), v[0], v[2] ? Math.round(v[1] / v[2]) : "", v[3]]) }],
      };
    },
  },
} satisfies Record<string, Topic>;

export type TopicKey = keyof typeof TOPICS;
export const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[];

/** Which topics this person may read — the same answer their menu gives. */
export const topicsFor = (session: Session) => { const m = modulesOf(session); return TOPIC_KEYS.filter((k) => (TOPICS[k] as Topic).may(m, session.profile.role)); };

/** Run one topic, or say plainly why not. */
export async function read(s: DB, session: Session, key: string, r: Range): Promise<Result | { refused: string }> {
  if (!(key in TOPICS)) return { refused: `There is no "${key}" to read.` };
  if (!topicsFor(session).includes(key as TopicKey)) return { refused: `${TOPICS[key as TopicKey].label} is not open to your role (${session.profile.role}). The owner can grant it in Staff.` };
  return (TOPICS[key as TopicKey] as Topic).run({ s, rid: session.restaurant.id, r, session });
}
