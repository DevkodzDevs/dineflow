/**
 * Reports by department (0140 report_departments): one description of every department's table — the columns, what each
 * holds — used by the screen (DataTable), the Excel sheet and the PDF, so the three never disagree.
 */
import type { Table } from "@/lib/tablePdf";

export type Row = Record<string, unknown>;
export type Dept = {
  from: string; to: string;
  sales: Row[]; sales_totals: { bills: number; total: number; gst: number; discount: number };
  online: Row[]; online_totals: { orders: number; rejected: number; gross: number; commission: number; payout: number };
  rooms: Row[]; rooms_totals: { stays: number; nights: number; revenue: number };
  facilities: Row[]; facilities_totals: { bookings: number; amount: number };
  expenses: Row[]; expenses_totals: { entries: number; amount: number; gst: number; by_category: { category: string; amount: number }[] };
  purchases: Row[]; purchases_totals: { purchases: number; total: number };
  payroll: Row[]; payroll_totals: { people: number; gross: number; net: number; paid: number };
  attendance: Row[]; attendance_totals: { staff: number; hours: number; labour_wages: number };
  housekeeping: Row[]; housekeeping_totals: { done: number; open: number };
  customers: Row[]; customers_totals: { came: number; new: number; points_out: number };
  inventory: Row[]; inventory_totals: { items: number; value: number; low: number; wastage_cost: number };
  cancelled: Row[]; cancelled_totals: { lines: number; lines_amount: number; voids: number; voids_amount: number };
  cashups: Row[]; cashups_totals: { closes: number; variance: number; short: number };
  by_day: { day: string; label: string; dining: number; rooms: number; facilities: number; expenses: number; purchases: number }[];
};
export type DeptKey = "sales" | "online" | "rooms" | "facilities" | "expenses" | "purchases" | "payroll" | "attendance" | "housekeeping" | "customers" | "inventory" | "cancelled" | "cashups";
export type Kind = "text" | "money" | "num" | "date" | "time" | "bool" | "month";
export type Col = { key: string; label: string; kind?: Kind; phone?: boolean };
export type DeptSpec = { key: DeptKey; title: string; what: string; lodging?: boolean; flow: "in" | "out" | "none"; cols: Col[]; search: string[] };

export const DEPTS: DeptSpec[] = [
  { key: "sales", title: "Sales", what: "Every paid bill from the till and the tables", flow: "in", search: ["customer", "where", "billed_by", "bill_no"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "bill_no", label: "Bill", kind: "num" }, { key: "type", label: "Type" }, { key: "where", label: "Where", phone: true }, { key: "customer", label: "Customer", phone: true },
    { key: "items", label: "Items", kind: "num", phone: true }, { key: "subtotal", label: "Subtotal", kind: "money", phone: true }, { key: "discount", label: "Discount", kind: "money", phone: true }, { key: "gst", label: "GST", kind: "money", phone: true },
    { key: "total", label: "Total", kind: "money" }, { key: "paid_by", label: "Paid by", phone: true }, { key: "billed_by", label: "Billed by", phone: true } ] },
  { key: "online", title: "Online orders", what: "Swiggy, Zomato, ONDC and the website — what the platform kept", flow: "none", search: ["channel", "ref", "customer", "rider"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "channel", label: "Channel" }, { key: "ref", label: "Order" }, { key: "customer", label: "Customer", phone: true }, { key: "status", label: "Status" },
    { key: "gross", label: "Gross", kind: "money" }, { key: "commission", label: "Commission", kind: "money", phone: true }, { key: "payout", label: "Payout", kind: "money", phone: true }, { key: "prepaid", label: "Paid online", kind: "bool", phone: true }, { key: "rider", label: "Rider", phone: true } ] },
  { key: "rooms", title: "Rooms", what: "Every stay that touched the period, with its folio", lodging: true, flow: "in", search: ["guest", "room", "type", "source", "booking_no"], cols: [
    { key: "booking_no", label: "Booking", kind: "num" }, { key: "guest", label: "Guest" }, { key: "room", label: "Room" }, { key: "type", label: "Type", phone: true }, { key: "check_in", label: "In", kind: "date" }, { key: "check_out", label: "Out", kind: "date", phone: true },
    { key: "nights", label: "Nights", kind: "num", phone: true }, { key: "rate", label: "Rate", kind: "money", phone: true }, { key: "room_total", label: "Room", kind: "money", phone: true }, { key: "extras", label: "Extras", kind: "money", phone: true }, { key: "gst", label: "GST", kind: "money", phone: true },
    { key: "total", label: "Total", kind: "money" }, { key: "paid", label: "Paid", kind: "money", phone: true }, { key: "balance", label: "Balance", kind: "money", phone: true }, { key: "status", label: "Status" }, { key: "source", label: "Source", phone: true } ] },
  { key: "facilities", title: "Facilities", what: "Spa, pool, hall and activity bookings", lodging: true, flow: "in", search: ["facility", "guest", "kind"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "facility", label: "Facility" }, { key: "kind", label: "Kind", phone: true }, { key: "guest", label: "Guest" }, { key: "people", label: "People", kind: "num", phone: true }, { key: "amount", label: "Amount", kind: "money" }, { key: "status", label: "Status", phone: true }, { key: "on_folio", label: "On folio", kind: "bool", phone: true } ] },
  { key: "expenses", title: "Expenses", what: "Every rupee that went out, by category", flow: "out", search: ["category", "payee", "note", "ref", "by"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "category", label: "Category" }, { key: "payee", label: "Payee", phone: true }, { key: "amount", label: "Amount", kind: "money" }, { key: "gst", label: "GST in it", kind: "money", phone: true }, { key: "method", label: "Paid by", phone: true }, { key: "ref", label: "Ref", phone: true }, { key: "note", label: "Note", phone: true }, { key: "by", label: "Entered by", phone: true } ] },
  { key: "purchases", title: "Pantry purchases", what: "What the pantry bought, from whom", flow: "out", search: ["supplier", "invoice", "by"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "supplier", label: "Supplier" }, { key: "invoice", label: "Invoice", phone: true }, { key: "items", label: "Lines", kind: "num", phone: true }, { key: "qty", label: "Qty", kind: "num", phone: true }, { key: "total", label: "Total", kind: "money" }, { key: "po", label: "From a PO", kind: "bool", phone: true }, { key: "by", label: "By", phone: true } ] },
  { key: "payroll", title: "Payroll", what: "Pay for the months in the period, person by person", flow: "none", search: ["name", "role", "month"], cols: [
    { key: "month", label: "Month" }, { key: "name", label: "Name" }, { key: "role", label: "Role", phone: true }, { key: "basis", label: "Basis", phone: true }, { key: "rate", label: "Rate", kind: "money", phone: true }, { key: "present", label: "Present", kind: "num", phone: true }, { key: "days", label: "Paid days", kind: "num", phone: true },
    { key: "gross", label: "Gross", kind: "money" }, { key: "bonus", label: "Bonus", kind: "money", phone: true }, { key: "deductions", label: "Deductions", kind: "money", phone: true }, { key: "net", label: "Net", kind: "money" }, { key: "paid_at", label: "Paid", kind: "date", phone: true }, { key: "method", label: "How", phone: true }, { key: "run", label: "Run", phone: true } ] },
  { key: "attendance", title: "Attendance & labour", what: "Who worked, how many days and hours; daily labour with its wages", flow: "none", search: ["name", "role", "kind"], cols: [
    { key: "kind", label: "Kind", phone: true }, { key: "name", label: "Name" }, { key: "role", label: "Role", phone: true }, { key: "days", label: "Days", kind: "num" }, { key: "hours", label: "Hours", kind: "num" }, { key: "wage", label: "Wages", kind: "money" } ] },
  { key: "housekeeping", title: "Housekeeping", what: "Rooms and jobs finished, by who did them", lodging: true, flow: "none", search: ["name"], cols: [
    { key: "name", label: "Name" }, { key: "done", label: "Done", kind: "num" }, { key: "rooms", label: "Rooms", kind: "num", phone: true }, { key: "turndown", label: "Turndown", kind: "num", phone: true }, { key: "maintenance", label: "Maintenance", kind: "num", phone: true }, { key: "avg_min", label: "Avg min", kind: "num" }, { key: "inspected", label: "Inspected", kind: "num", phone: true } ] },
  { key: "customers", title: "Customers", what: "Who came, what they spent, the points they earned and used", flow: "none", search: ["name", "phone"], cols: [
    { key: "name", label: "Name" }, { key: "phone", label: "Phone", phone: true }, { key: "visits", label: "Visits", kind: "num" }, { key: "spend", label: "Spend", kind: "money" }, { key: "earned", label: "Points earned", kind: "num", phone: true }, { key: "redeemed", label: "Redeemed", kind: "num", phone: true }, { key: "points", label: "Points now", kind: "num", phone: true }, { key: "new", label: "New", kind: "bool", phone: true } ] },
  { key: "inventory", title: "Pantry stock", what: "What is on the shelf now and what it is worth; what was wasted in the period", flow: "none", search: ["name", "category"], cols: [
    { key: "name", label: "Ingredient" }, { key: "category", label: "Category", phone: true }, { key: "unit", label: "Unit", phone: true }, { key: "stock", label: "Stock", kind: "num" }, { key: "reorder", label: "Reorder at", kind: "num", phone: true }, { key: "cost", label: "Cost", kind: "money", phone: true }, { key: "value", label: "Value", kind: "money" }, { key: "low", label: "Low", kind: "bool" }, { key: "wasted", label: "Wasted", kind: "num", phone: true } ] },
  { key: "cancelled", title: "Cancelled & voided", what: "Lines taken off tickets and bills voided, with the reason and who did it", flow: "none", search: ["what", "reason", "by", "ref"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "kind", label: "Kind" }, { key: "what", label: "What" }, { key: "qty", label: "Qty", kind: "num", phone: true }, { key: "amount", label: "Amount", kind: "money" }, { key: "reason", label: "Reason", phone: true }, { key: "by", label: "By", phone: true }, { key: "ref", label: "Ref", phone: true } ] },
  { key: "cashups", title: "Cash-ups", what: "Each till close: what was expected, what was counted, the difference", flow: "none", search: ["by", "note"], cols: [
    { key: "day", label: "Day", kind: "date" }, { key: "closed_at", label: "Closed", kind: "time", phone: true }, { key: "expected", label: "Expected", kind: "money", phone: true }, { key: "cash_expected", label: "Cash due", kind: "money", phone: true }, { key: "counted", label: "Counted", kind: "money" }, { key: "float", label: "Float", kind: "money", phone: true },
    { key: "variance", label: "Variance", kind: "money" }, { key: "upi", label: "UPI", kind: "money", phone: true }, { key: "card", label: "Card", kind: "money", phone: true }, { key: "by", label: "By", phone: true }, { key: "note", label: "Note", phone: true } ] },
];

const n2 = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
export const fmtDay = (v: unknown) => (typeof v === "string" && v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: v.length === 10 ? undefined : "Asia/Kolkata" }) : "");
export const fmtTime = (v: unknown) => (typeof v === "string" && v ? new Date(v).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
/** a cell as the Excel sheet and the PDF carry it: numbers stay numbers, a date reads "24 Oct", a flag "Yes" */
export const cellOf = (c: Col, v: unknown): string | number | null => {
  if (v === null || v === undefined) return c.kind === "money" || c.kind === "num" ? 0 : "";
  switch (c.kind) {
    case "money": case "num": return n2(v);
    case "date": return fmtDay(v);
    case "time": return fmtTime(v);
    case "bool": return v ? "Yes" : "";
    default: return String(v);
  }
};
export const deptRows = (d: Dept, key: DeptKey): Row[] => (d[key] as Row[]) ?? [];
/** which departments show for this property: the lodging ones only for a hotel or resort, the rest always */
export const deptsFor = (lodging: boolean) => DEPTS.filter((s) => !s.lodging || lodging);
/** one department as a plain table — the Excel sheet and the PDF are both drawn from this */
export function deptTable(d: Dept, s: DeptSpec): Table {
  const rows = deptRows(d, s.key);
  return { title: s.title, note: s.what, head: s.cols.map((c) => c.label), rows: rows.map((r) => s.cols.map((c) => cellOf(c, r[c.key]))),
    right: s.cols.map((c, i) => (c.kind === "money" || c.kind === "num" ? i : -1)).filter((i) => i >= 0), widths: s.cols.map((c) => (c.kind === "money" || c.kind === "num" || c.kind === "date" || c.kind === "bool" ? 1 : 1.8)) };
}
/** every department, the period's income and outgoings first */
export function departmentTables(d: Dept, lodging: boolean): Table[] {
  const inc = d.by_day.reduce((a, x) => a + Number(x.dining) + Number(x.rooms) + Number(x.facilities), 0), out = d.by_day.reduce((a, x) => a + Number(x.expenses) + Number(x.purchases), 0);
  const t: Table[] = [{ title: "In and out by day", head: ["Day", "Dining", ...(lodging ? ["Rooms", "Facilities"] : []), "Income", "Expenses", "Purchases", "Outgoings", "Net"],
    rows: [...d.by_day.map((x) => { const i = Number(x.dining) + Number(x.rooms) + Number(x.facilities), o = Number(x.expenses) + Number(x.purchases); return [x.day, n2(x.dining), ...(lodging ? [n2(x.rooms), n2(x.facilities)] : []), n2(i), n2(x.expenses), n2(x.purchases), n2(o), n2(i - o)]; }),
      ["Total", n2(d.by_day.reduce((a, x) => a + Number(x.dining), 0)), ...(lodging ? [n2(d.by_day.reduce((a, x) => a + Number(x.rooms), 0)), n2(d.by_day.reduce((a, x) => a + Number(x.facilities), 0))] : []), n2(inc), n2(d.expenses_totals.amount), n2(d.purchases_totals.total), n2(out), n2(inc - out)]] }];
  for (const s of deptsFor(lodging)) t.push(deptTable(d, s));
  return t;
}
