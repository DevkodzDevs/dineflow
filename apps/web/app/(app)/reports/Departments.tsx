"use client";
import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Receipt, Bike, BedDouble, Waves, Wallet, ShoppingCart, Users, Clock, Sparkles, HeartHandshake, Boxes, Ban, Landmark, FileSpreadsheet, FileText, Loader2, TrendingUp, TrendingDown, Scale, ChevronDown, Check } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { DataTable } from "@/components/ui/DataTable";
import { formatINR } from "@/lib/format";
import { deptsFor, deptRows, deptTable, cellOf, fmtDay, fmtTime, type Dept, type DeptKey, type DeptSpec, type Row } from "./deptSpec";
const MoneyChart = dynamic(() => import("./Charts").then((m) => m.MoneyChart), { ssr: false, loading: () => <div className="h-60 shimmer rounded-2xl" /> });
const ShareChart = dynamic(() => import("./Charts").then((m) => m.ShareChart), { ssr: false, loading: () => <div className="h-60 shimmer rounded-2xl" /> });

const ICON: Record<DeptKey, typeof Receipt> = { sales: Receipt, online: Bike, rooms: BedDouble, facilities: Waves, expenses: Wallet, purchases: ShoppingCart, payroll: Users, attendance: Clock, housekeeping: Sparkles, customers: HeartHandshake, inventory: Boxes, cancelled: Ban, cashups: Landmark };
const HUE: Record<DeptKey, string> = { sales: "--color-tint", online: "--color-orange", rooms: "--color-blue", facilities: "--color-cyan", expenses: "--color-red", purchases: "--color-orange", payroll: "--color-violet", attendance: "--color-label-2", housekeeping: "--color-cyan", customers: "--color-violet", inventory: "--color-blue", cancelled: "--color-red", cashups: "--color-tint" };
const money = (v: unknown) => formatINR(Number(v ?? 0));

/** one line under each department's name: the figures that matter for it */
function totalsOf(d: Dept, k: DeptKey): string {
  const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-IN");
  switch (k) {
    case "sales": return `${n(d.sales_totals.bills)} bills · ${money(d.sales_totals.total)} · GST ${money(d.sales_totals.gst)}`;
    case "online": return `${n(d.online_totals.orders)} orders · ${money(d.online_totals.gross)} · commission ${money(d.online_totals.commission)} · payout ${money(d.online_totals.payout)}`;
    case "rooms": return `${n(d.rooms_totals.stays)} stays · ${n(d.rooms_totals.nights)} nights · room revenue ${money(d.rooms_totals.revenue)}`;
    case "facilities": return `${n(d.facilities_totals.bookings)} bookings · ${money(d.facilities_totals.amount)}`;
    case "expenses": return `${n(d.expenses_totals.entries)} entries · ${money(d.expenses_totals.amount)} · GST in it ${money(d.expenses_totals.gst)}`;
    case "purchases": return `${n(d.purchases_totals.purchases)} purchases · ${money(d.purchases_totals.total)}`;
    case "payroll": return `${n(d.payroll_totals.people)} people · gross ${money(d.payroll_totals.gross)} · net ${money(d.payroll_totals.net)} · paid ${money(d.payroll_totals.paid)}`;
    case "attendance": return `${n(d.attendance_totals.staff)} staff · ${n(d.attendance_totals.hours)} hours · labour wages ${money(d.attendance_totals.labour_wages)}`;
    case "housekeeping": return `${n(d.housekeeping_totals.done)} done · ${n(d.housekeeping_totals.open)} still open`;
    case "customers": return `${n(d.customers_totals.came)} came · ${n(d.customers_totals.new)} new · ${n(d.customers_totals.points_out)} points outstanding`;
    case "inventory": return `${n(d.inventory_totals.items)} items worth ${money(d.inventory_totals.value)} · ${n(d.inventory_totals.low)} low · wasted ${money(d.inventory_totals.wastage_cost)}`;
    case "cancelled": return `${n(d.cancelled_totals.lines)} lines ${money(d.cancelled_totals.lines_amount)} · ${n(d.cancelled_totals.voids)} voids ${money(d.cancelled_totals.voids_amount)}`;
    case "cashups": return `${n(d.cashups_totals.closes)} closes · variance ${money(d.cashups_totals.variance)} · short ${money(Math.abs(d.cashups_totals.short))}`;
  }
}

/**
 * Reports by department (0140, 2026-10-24, the owner: "every in and out, every department its own table, Excel and PDF for
 * all of it and for each one, charts"). The overview first — income beside outgoings by day, where the money came from and
 * where it went — then a rail of departments; each is a card with its figures in one line, its own table (search, pages,
 * the phone keeps the columns that matter) and its own Excel and PDF. "Export all" on the page's top row takes every one.
 */
export function Departments({ d, lodging, property, fileBase, period }: { d: Dept; lodging: boolean; property: string; fileBase: string; period: string }) {
  const specs = useMemo(() => deptsFor(lodging), [lodging]);
  const [open, setOpen] = useState<DeptKey[]>(["sales", "expenses"]);
  const [busy, setBusy] = useState<string | null>(null);
  const byDay = d.by_day.map((x) => ({ label: x.label, income: Number(x.dining) + Number(x.rooms) + Number(x.facilities), outgoings: Number(x.expenses) + Number(x.purchases) }));
  const income = byDay.reduce((a, x) => a + x.income, 0), out = byDay.reduce((a, x) => a + x.outgoings, 0);
  const inSlices = [{ name: "Dining", value: d.by_day.reduce((a, x) => a + Number(x.dining), 0) }, ...(lodging ? [{ name: "Rooms", value: d.by_day.reduce((a, x) => a + Number(x.rooms), 0) }, { name: "Facilities", value: d.by_day.reduce((a, x) => a + Number(x.facilities), 0) }] : [])];
  const outSlices = [...d.expenses_totals.by_category.slice(0, 5).map((c) => ({ name: c.category, value: Number(c.amount) })), ...(d.expenses_totals.by_category.length > 5 ? [{ name: "Other expenses", value: d.expenses_totals.by_category.slice(5).reduce((a, c) => a + Number(c.amount), 0) }] : []), { name: "Pantry purchases", value: Number(d.purchases_totals.total) }];
  const exportOne = async (s: DeptSpec, kind: "xlsx" | "pdf") => {
    setBusy(`${s.key}:${kind}`);
    try {
      const t = deptTable(d, s); const name = `${fileBase}-${s.key}`;
      const { download, xlsx, XLSX_TYPE } = await import("@/lib/xlsx");
      if (kind === "xlsx") download(`${name}.xlsx`, xlsx([{ name: t.title, rows: [t.head, ...t.rows] }]), XLSX_TYPE);
      else { const { tablesPdf } = await import("@/lib/tablePdf"); download(`${name}.pdf`, new Uint8Array(await tablesPdf(`${property} · ${s.title}`, `${period} (IST) · ${totalsOf(d, s.key)}`, [t])), "application/pdf"); }
    } finally { setBusy(null); }
  };
  const toggle = (k: DeptKey) => setOpen((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const jump = (k: DeptKey) => { if (!open.includes(k)) setOpen((o) => [...o, k]); setTimeout(() => document.getElementById(`dept-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };
  return (
    <div className="space-y-4" data-departments>
      {/* the overview: in, out, what is left; the shape of the period; the shares */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-dept-kpis>
        {[["Income", income, TrendingUp, "var(--color-green)"], ["Outgoings", out, TrendingDown, "var(--color-red)"], ["Net", income - out, Scale, income - out >= 0 ? "var(--color-green)" : "var(--color-red)"]].map(([k, v, I, c]) => {
          const Icon = I as typeof TrendingUp;
          return <div key={k as string} className="feather px-4 py-3.5 flex items-center gap-3 min-w-0" data-kpi={(k as string).toLowerCase()}>
            <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c as string }}><Icon size={20} aria-hidden /></span>
            <div className="min-w-0"><div className="text-[12.5px] font-bold text-steel">{k as string}</div><div className="font-display num text-[26px] leading-tight truncate">{formatINR(v as number)}</div></div>
          </div>; })}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card data-money-chart><div className="text-[15px] font-extrabold mb-2 flex items-center gap-2">In and out, by day <span className="text-[11px] font-semibold text-steel ml-auto flex items-center gap-3"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--color-tint)]" /> income</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--color-red)]" /> outgoings</span></span></div><MoneyChart data={byDay} /></Card>
        <Card data-share-in><div className="text-[15px] font-extrabold mb-2">Where income came from</div><ShareChart slices={inSlices} label="Income" /></Card>
        <Card data-share-out><div className="text-[15px] font-extrabold mb-2">Where it went</div><ShareChart slices={outSlices} label="Outgoings" /></Card>
      </div>

      {/* the departments: a rail to jump, then a card each */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]" data-dept-rail>
        {specs.map((s) => { const Icon = ICON[s.key]; const n = deptRows(d, s.key).length; return (
          <button key={s.key} type="button" onClick={() => jump(s.key)} className="shrink-0 min-h-10 pl-2.5 pr-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold bg-[var(--color-bg-2)] border border-[var(--color-separator)] hover:border-[var(--color-label-3)]" data-dept-chip={s.key}>
            <Icon size={14} style={{ color: `var(${HUE[s.key]})` }} aria-hidden />{s.title}<span className="num text-[11.5px] text-steel">{n}</span></button>); })}
      </div>
      {specs.map((s) => <DeptCard key={s.key} d={d} s={s} open={open.includes(s.key)} onToggle={() => toggle(s.key)} busy={busy} onExport={(k) => void exportOne(s, k)} />)}
    </div>
  );
}

function DeptCard({ d, s, open, onToggle, busy, onExport }: { d: Dept; s: DeptSpec; open: boolean; onToggle: () => void; busy: string | null; onExport: (k: "xlsx" | "pdf") => void }) {
  const Icon = ICON[s.key]; const rows = useMemo(() => deptRows(d, s.key).map((r, i) => ({ ...r, __i: i })), [d, s.key]);   // DataTable wants a key per row
  const cols = s.cols.map((c) => ({ key: c.key, label: c.label, num: c.kind === "money" || c.kind === "num", hideOnPhone: c.phone,
    render: (r: Row): ReactNode => { const v = r[c.key]; if (c.kind === "money") return <span className={cn("num", c.key === "variance" && Number(v) < 0 && "text-chili")}>{money(v)}</span>; if (c.kind === "bool") return v ? <Check size={14} className="text-mint inline" aria-label="Yes" /> : ""; if (c.kind === "date") return <span className="num">{fmtDay(v)}</span>; if (c.kind === "time") return <span className="num">{fmtTime(v)}</span>; if (c.kind === "num") return <span className="num">{Number(v ?? 0).toLocaleString("en-IN")}</span>; return String(cellOf(c, v)); } }));
  return (
    <section id={`dept-${s.key}`} className="feather overflow-hidden scroll-mt-24" data-dept={s.key} data-open={open}>
      <div className="p-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-3 min-w-0 flex-1 text-left" data-dept-toggle>
          <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center" style={{ background: `color-mix(in srgb, var(${HUE[s.key]}) 15%, transparent)`, color: `var(${HUE[s.key]})` }}><Icon size={20} aria-hidden /></span>
          <span className="min-w-0 flex-1"><span className="block text-[17px] font-extrabold leading-tight">{s.title} <span className="num text-[12px] font-semibold text-steel">· {rows.length}</span></span><span className="block text-[12.5px] text-steel truncate" data-dept-totals>{totalsOf(d, s.key)}</span></span>
          <ChevronDown size={18} className={cn("shrink-0 text-steel transition-transform", open && "rotate-180")} aria-hidden />
        </button>
        <div className="flex items-center gap-1.5 w-full sm:w-auto" data-dept-export>
          <button type="button" disabled={!!busy} onClick={() => onExport("xlsx")} className="svc-btn quiet sm !px-3.5 flex-1 sm:flex-none" data-export-xlsx>{busy === `${s.key}:xlsx` ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <FileSpreadsheet size={15} aria-hidden />} Excel</button>
          <button type="button" disabled={!!busy} onClick={() => onExport("pdf")} className="svc-btn quiet sm !px-3.5 flex-1 sm:flex-none" data-export-pdf>{busy === `${s.key}:pdf` ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <FileText size={15} aria-hidden />} PDF</button>
        </div>
      </div>
      {open && <div className="border-t border-[var(--color-separator)]" data-dept-table>
        <DataTable rows={rows as never} columns={cols as never} rowKey={"__i" as never} search={s.search as never} pageSize={15} dense empty={`Nothing in ${s.title.toLowerCase()} for this period.`} />
      </div>}
    </section>
  );
}
