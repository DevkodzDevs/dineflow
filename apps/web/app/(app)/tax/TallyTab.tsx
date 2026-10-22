"use client";
import { useEffect, useState, useTransition } from "react";
import { FileCode2, FileSpreadsheet, BookOpen, Loader2, Check } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { DEFAULT_LEDGERS, withDefaults, tallyVouchers, tallyLedgers, saleLines, stayLines, balances, payMethodOf, type Ledgers, type SaleDay, type Expense, type StayInvoice } from "@/lib/tally";
import { tallyDays, saveTallyNames } from "./actions";

const LABEL: Record<keyof Ledgers, string> = {
  sales: "Food sales", service: "Service charge", cgst: "Output CGST", sgst: "Output SGST", round_off: "Round off", other_income: "Other income",
  cash: "Cash", upi: "UPI", card: "Card", other: "Other payments", bank: "Bank (expenses not in cash)", input_gst: "Input GST (expenses)",
  room_sales: "Room revenue (stays)", guest_services: "Guest services (laundry, spa…)", discount: "Discount allowed (stays)", debtors: "Guests still owing (stays)",
  expense_prefix: "Before each expense head (optional)",
};
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; };

/**
 * Tally, without a connector: pick the period, see each day's bills and expenses, download the vouchers (and, the
 * first time, the ledgers) as Tally XML, and import them in Tally (Gateway → Import → Vouchers). The names here must
 * match the ledgers in the company's Tally; they are saved for the property. Dining is one voucher a day from its
 * bills; each stay or facility invoice is a voucher of its own (0109).
 */
export function TallyTab({ month, company: company0, ledgers: ledgers0, canEdit }: { month: string; company: string; ledgers: Partial<Ledgers>; canEdit: boolean }) {
  const [from, setFrom] = useState(`${month}-01`); const [to, setTo] = useState(lastDay(month));
  const [data, setData] = useState<{ sales: SaleDay[]; expenses: Expense[]; stays: StayInvoice[] } | null>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const [company, setCompany] = useState(company0); const [names, setNames] = useState<Partial<Ledgers>>(ledgers0);
  const [pending, start] = useTransition(); const [saved, setSaved] = useState(false);
  const L = withDefaults(names);
  useEffect(() => {
    let on = true; setLoading(true); setErr(null);
    void tallyDays(from, to).then((r) => { if (!on) return; setLoading(false); if ("data" in r && r.data) setData(r.data); else { setData(null); setErr("error" in r ? r.error! : "Could not read the period"); } });
    return () => { on = false; };
  }, [from, to]);
  const totals = data ? data.sales.reduce((a, d) => ({ bills: a.bills + Number(d.bills), total: a.total + Number(d.total), gst: a.gst + Number(d.cgst) + Number(d.sgst) }), { bills: 0, total: 0, gst: 0 }) : null;
  const unbalanced = data ? data.sales.filter((d) => !balances(saleLines(d, L))).length + (data.stays ?? []).filter((x) => !balances(stayLines(x, L))).length : 0;
  const file = async (kind: "vouchers" | "ledgers" | "daybook") => {
    if (!data) return;
    const { download, xlsx, XLSX_TYPE } = await import("@/lib/xlsx");
    const base = `tally-${from}-to-${to}`;
    if (kind === "vouchers") download(`${base}-vouchers.xml`, tallyVouchers(company, data.sales, data.expenses, L, data.stays ?? []).xml, "application/xml");
    else if (kind === "ledgers") download(`tally-ledgers.xml`, tallyLedgers(company, data.expenses, L), "application/xml");
    else download(`${base}-daybook.xlsx`, xlsx([
      { name: "Sales by day", rows: [["Day", "Bills", "First bill", "Last bill", "Taxable", "Service", "CGST", "SGST", "Round off", "Total", "Cash", "UPI", "Card", "Other"],
        ...data.sales.map((d) => [d.day, d.bills, d.first, d.last, Number(d.taxable), Number(d.service), Number(d.cgst), Number(d.sgst), Number(d.round_off), Number(d.total), Number(d.paid?.cash ?? 0), Number(d.paid?.upi ?? 0), Number(d.paid?.card ?? 0), Number(d.paid?.other ?? 0)])] },
      { name: "Stays", rows: [["Day", "Invoice", "Kind", "Guest", "GSTIN", "Subtotal", "Discount", "CGST", "SGST", "Round off", "Total", "Paid", "Owing", "Paid by"],
        ...(data.stays ?? []).map((x) => [x.day, x.no, x.kind, x.guest ?? "", x.gstin ?? "", Number(x.subtotal), Number(x.discount), Number(x.cgst), Number(x.sgst), Number(x.round_off), Number(x.total), Number(x.paid), Math.round((Number(x.total) - Number(x.paid)) * 100) / 100, [...new Set((x.payments ?? []).map((p) => payMethodOf(p.description)))].join(", ")])] },
      { name: "Expenses", rows: [["Day", "Head", "Paid to", "Amount", "GST in it", "Paid by", "Ref"], ...data.expenses.map((e) => [e.day, e.category, e.payee ?? "", Number(e.amount), Number(e.gst), e.method.toUpperCase(), e.ref ?? ""])] },
    ]), XLSX_TYPE);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" data-tally>
      <div className="space-y-4 min-w-0">
        <Card>
          <div className="text-[17px] font-extrabold mb-3">Export to Tally</div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">From</span><input type="date" className="mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="min-w-0"><span className="text-[13px] font-semibold text-steel">To</span><input type="date" className="mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" data-tally-totals>
            {[["Bills", totals ? String(totals.bills) : "—"], ["Billed", totals ? formatINR(totals.total) : "—"], ["Stays", data ? String((data.stays ?? []).length) : "—"], ["Expenses", data ? String(data.expenses.length) : "—"]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-[var(--color-fill)] px-3 py-2.5 min-w-0"><div className="text-[12px] font-bold text-steel">{k}</div><div className="num font-extrabold text-[18px] truncate">{loading ? "…" : v}</div></div>))}
          </div>
          {err && <p className="mt-3 text-[14px] font-semibold text-chili" role="alert">{err}</p>}
          {unbalanced > 0 && <p className="mt-3 text-[14px] font-semibold text-chili">{unbalanced} day(s) do not balance — tell support.</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button type="button" disabled={!data || loading} onClick={() => void file("vouchers")} className="svc-btn go sm" data-tally-vouchers><FileCode2 size={17} aria-hidden /> Vouchers (.xml)</button>
            <button type="button" disabled={!data || loading} onClick={() => void file("ledgers")} className="svc-btn quiet sm" data-tally-ledgers><BookOpen size={17} aria-hidden /> Ledgers (.xml)</button>
            <button type="button" disabled={!data || loading} onClick={() => void file("daybook")} className="svc-btn quiet sm" data-tally-daybook><FileSpreadsheet size={17} aria-hidden /> Day book (.xlsx)</button>
          </div>
          <ol className="mt-4 list-decimal pl-5 text-[13.5px] text-steel space-y-1">
            <li>First time only: in Tally, <b>Gateway of Tally → Import → Masters</b>, pick the Ledgers file. Existing ledgers stay as they are.</li>
            <li>Every month: <b>Import → Vouchers</b>, pick the Vouchers file. Dining: one a day (DF-S). Stays: one per invoice (DF-R/DF-F). Expenses: one each (DF-E).</li>
            <li>Match Tally&apos;s day book with the Day book sheet.</li>
          </ol>
        </Card>
        <Card className="!p-0 overflow-hidden">
          <div className="px-4 pt-4 text-[15px] font-extrabold">Days in the file</div>
          <div className="overflow-x-auto"><table className="w-full text-sm mt-2"><thead><tr className="text-left text-steel text-xs"><th className="px-4 py-1.5">Day</th><th className="py-1.5 text-right">Bills</th><th className="py-1.5 text-right">Taxable</th><th className="py-1.5 text-right">GST</th><th className="px-4 py-1.5 text-right">Total</th></tr></thead>
            <tbody>{(data?.sales ?? []).map((d) => <tr key={d.day} className="border-t border-line"><td className="px-4 py-2 num">{d.day}</td><td className="py-2 text-right num">{d.bills}</td><td className="py-2 text-right num">{formatINR(Number(d.taxable))}</td><td className="py-2 text-right num">{formatINR(Number(d.cgst) + Number(d.sgst))}</td><td className="px-4 py-2 text-right num font-bold">{formatINR(Number(d.total))}</td></tr>)}
              {data && data.sales.length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-steel">No paid bills in this period.</td></tr>}</tbody></table></div>
        </Card>
      </div>

      <Card className="min-w-0 self-start" data-tally-names>
        <div className="text-[17px] font-extrabold">Names in your Tally</div>
        <p className="text-[13px] text-steel mt-1 mb-3">Must match Tally exactly. Blank uses the grey name.</p>
        <label className="block"><span className="text-[13px] font-semibold text-steel">Company (as in Tally)</span><input className="mt-1" value={company} disabled={!canEdit} onChange={(e) => setCompany(e.target.value)} maxLength={80} placeholder="Leave blank to import into the open company" /></label>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(DEFAULT_LEDGERS) as (keyof Ledgers)[]).map((k) => (
            <label key={k} className={cn("min-w-0", k === "expense_prefix" && "sm:col-span-2")}><span className="text-[12.5px] font-semibold text-steel">{LABEL[k]}</span>
              <input className="mt-1" value={names[k] ?? ""} disabled={!canEdit} onChange={(e) => setNames((n) => ({ ...n, [k]: e.target.value }))} placeholder={DEFAULT_LEDGERS[k] || "e.g. Exp - "} maxLength={60} /></label>))}
        </div>
        {canEdit ? <button type="button" disabled={pending} className="svc-btn go w-full mt-4" data-save-tally
          onClick={() => start(async () => { setSaved(false); const r = await saveTallyNames(company, Object.fromEntries(Object.entries(names).filter(([, v]) => (v ?? "").trim())) as Record<string, string>); if ("error" in r) setErr(r.error!); else setSaved(true); })}>
          {pending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} aria-hidden />} Save names</button> : <p className="mt-3 text-[13px] text-steel">Only the owner or a manager can change these.</p>}
        {saved && <p className="mt-2 text-[13.5px] font-semibold text-mint">Saved.</p>}
      </Card>
    </div>
  );
}
