"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Landmark, Plus, Trash2, Undo2, UserRound } from "lucide-react";
import { Button, Card, Field, Pill, Sheet, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { DOC_KINDS, GST_STATES, statutoryCalendar, taxLabels, type CalendarItem } from "@dineflow/shared";
import { saveTaxProfile, saveDoc, deleteDoc, markFiled, unmarkFiled } from "./actions";
import { Guide } from "./Guide";

export type Tab = "overview" | "returns" | "calendar" | "documents" | "profile" | "guide";
type Rest = { id: string; name: string; property_type: string; gstin: string | null; legal_name?: string | null; pan?: string | null; gst_scheme?: string | null; gst_state_code?: string | null; gst_monthly?: boolean | null; fssai_no?: string | null; gst_rate: number; room_gst_rate?: number; ca_name?: string | null; ca_firm?: string | null; ca_membership_no?: string | null; ca_email?: string | null; ca_phone?: string | null };
type Filing = { id: string; form: string; period: string; due_on: string; filed_on: string | null; ack_no: string | null };
type Doc = { id: string; kind: string; title: string; number: string | null; issuer: string | null; issued_on: string | null; expires_on: string | null; period: string | null; url: string | null; notes: string | null };
type Row = { sac: string; kind: string; rate: number; count: number; taxable: number; cgst: number; sgst: number; total: number };
type Totals = { count: number; taxable: number; cgst: number; sgst: number; total: number };
type Summary = { from: string; to: string; dining: Row[]; stay: Row[]; b2b: { gstin: string; name: string | null; count: number; taxable: number; cgst: number; sgst: number; total: number }[]; dining_totals: Totals; stay_totals: Totals } | null;

const TABS: { key: Tab; label: string }[] = [{ key: "overview", label: "Overview" }, { key: "returns", label: "Returns" }, { key: "calendar", label: "Calendar" }, { key: "documents", label: "Documents" }, { key: "profile", label: "Profile & CA" }, { key: "guide", label: "Guide" }];
const day = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const monthLabel = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shiftMonth = (ym: string, by: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + by, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
const n2 = (v: unknown) => Number(v ?? 0).toFixed(2);

export function TaxClient({ tab, month, fy, today, restaurant: r, role, filings, docs, summary, summaryError, staffCount }:
  { tab: Tab; month: string; fy: string; today: string; restaurant: Rest; role: string; filings: Filing[]; docs: Doc[]; summary: Summary; summaryError: string | null; staffCount: number }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState<string | null>(null);
  const scheme = r.gst_scheme ?? "regular";
  const lab = taxLabels(r.gst_state_code);
  const calendar = useMemo(() => statutoryCalendar({ fy, scheme, stateCode: r.gst_state_code, monthlyGst: r.gst_monthly !== false, hasStaff: staffCount > 1 }), [fy, scheme, r.gst_state_code, r.gst_monthly, staffCount]);
  const filedKey = useMemo(() => new Map(filings.filter((f) => f.filed_on).map((f) => [`${f.form}|${f.period}`, f])), [filings]);
  const status = (c: CalendarItem) => { const f = filedKey.get(`${c.form}|${c.period}`); if (f) return { kind: "filed" as const, f }; const d = daysBetween(today, c.due); return d < 0 ? { kind: "overdue" as const, days: -d } : { kind: "due" as const, days: d }; };
  const overdue = calendar.filter((c) => !c.optional && status(c).kind === "overdue");
  const upcoming = calendar.filter((c) => status(c).kind === "due").slice(0, 6);
  const expiring = docs.filter((d) => d.expires_on && daysBetween(today, d.expires_on) <= 60);

  const go = (q: Record<string, string>) => { const p = new URLSearchParams({ tab, month, fy, ...q }); router.push(`/tax?${p.toString()}`); };

  return (
    <div>
      <div className="flex gap-1 p-1 bg-[var(--color-fill)] rounded-2xl w-fit max-w-full overflow-x-auto mb-6">
        {TABS.map((t) => <Link key={t.key} href={`/tax?tab=${t.key}&month=${month}&fy=${fy}`} className={cn("shrink-0 h-9 px-4 rounded-xl text-sm font-semibold grid place-items-center transition-colors", tab === t.key ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>{t.label}</Link>)}
      </div>
      {msg && <p className={cn("text-sm mb-4", /error|not|fail|cannot/i.test(msg) ? "text-[var(--color-red)]" : "text-[var(--color-green)]")}>{msg}</p>}

      {tab === "overview" && <Overview r={r} scheme={scheme} lab={lab} summary={summary} month={month} overdue={overdue} upcoming={upcoming} expiring={expiring} today={today} docsCount={docs.length} />}
      {tab === "returns" && <Returns r={r} lab={lab} month={month} summary={summary} error={summaryError} go={go} calendar={calendar} status={status} onFile={(c, filedOn, ack) => start(async () => { const x = await markFiled(c.form, c.period, c.due, filedOn, ack); setMsg("error" in x ? x.error! : `${c.form} for ${c.period} marked filed.`); })} pending={pending} />}
      {tab === "calendar" && <Calendar fy={fy} go={go} calendar={calendar} status={status} today={today} pending={pending}
        onFile={(c, filedOn, ack) => start(async () => { const x = await markFiled(c.form, c.period, c.due, filedOn, ack); setMsg("error" in x ? x.error! : `${c.form} for ${c.period} marked filed.`); })}
        onUndo={(c) => start(async () => { const x = await unmarkFiled(c.form, c.period); setMsg("error" in x ? x.error! : `${c.form} for ${c.period} is open again.`); })} />}
      {tab === "documents" && <Documents docs={docs} today={today} pending={pending} onSave={(fd) => start(async () => { const x = await saveDoc(fd); setMsg("error" in x ? x.error! : "Document saved."); })} onDelete={(id) => start(async () => { const x = await deleteDoc(id); setMsg("error" in x ? x.error! : "Document removed."); })} />}
      {tab === "profile" && <Profile r={r} role={role} pending={pending} onSave={(fd) => start(async () => { const x = await saveTaxProfile(fd); setMsg("error" in x ? x.error! : "Profile saved."); })} />}
      {tab === "guide" && <Guide propertyType={r.property_type} />}
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function Overview({ r, scheme, lab, summary, month, overdue, upcoming, expiring, today, docsCount }: { r: Rest; scheme: string; lab: ReturnType<typeof taxLabels>; summary: Summary; month: string; overdue: CalendarItem[]; upcoming: CalendarItem[]; expiring: { title: string; expires_on: string | null }[]; today: string; docsCount: number }) {
  const missing = [!r.gstin && scheme !== "unregistered" && "GSTIN", !r.pan && "PAN", !r.fssai_no && "FSSAI licence", !r.ca_name && "your CA"].filter(Boolean) as string[];
  const dt = summary?.dining_totals, st = summary?.stay_totals;
  const tax = Number(dt?.cgst ?? 0) + Number(dt?.sgst ?? 0) + Number(st?.cgst ?? 0) + Number(st?.sgst ?? 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="card-title"><h3>Registration</h3><Pill tone={scheme === "unregistered" ? "pending" : "ready"}>{scheme === "regular" ? "Regular · " + (r.gst_monthly === false ? "quarterly" : "monthly") : scheme}</Pill></div>
        <dl className="text-sm grid grid-cols-[130px_1fr] gap-y-1.5">
          <dt className="text-[var(--color-label-2)]">Legal name</dt><dd>{r.legal_name || r.name}</dd>
          <dt className="text-[var(--color-label-2)]">GSTIN</dt><dd className="num">{r.gstin || <span className="text-[var(--color-red)]">not set</span>}</dd>
          <dt className="text-[var(--color-label-2)]">PAN</dt><dd className="num">{r.pan || <span className="text-[var(--color-label-3)]">—</span>}</dd>
          <dt className="text-[var(--color-label-2)]">State</dt><dd>{lab.stateName ? `${lab.stateName} (${r.gst_state_code}) · ${lab.central} + ${lab.state}` : <span className="text-[var(--color-label-3)]">—</span>}</dd>
          <dt className="text-[var(--color-label-2)]">FSSAI</dt><dd className="num">{r.fssai_no || <span className="text-[var(--color-label-3)]">—</span>}</dd>
          <dt className="text-[var(--color-label-2)]">Rates in use</dt><dd className="num">Dining {r.gst_rate}%{r.property_type !== "restaurant" && ` · Rooms ${r.room_gst_rate ?? 12}%`}</dd>
          <dt className="text-[var(--color-label-2)]">Chartered Accountant</dt><dd>{r.ca_name ? <>{r.ca_name}{r.ca_firm && `, ${r.ca_firm}`}{r.ca_phone && <span className="num text-[var(--color-label-2)]"> · {r.ca_phone}</span>}</> : <span className="text-[var(--color-label-3)]">—</span>}</dd>
        </dl>
        {missing.length > 0 && <p className="text-sm mt-4 text-[var(--color-orange)]">Still to fill in: {missing.join(", ")}. <Link href="/tax?tab=profile" className="underline">Open the profile</Link>.</p>}
        {r.property_type !== "restaurant" && Number(r.room_gst_rate ?? 12) === 12 && <p className="text-xs mt-3 text-[var(--color-label-2)]">Rooms are set to 12%. Since 22 September 2025 rooms up to ₹7,500 a night carry 5% and rooms above it 18%. Check with your CA and change it in Settings if it applies.</p>}
      </Card>

      <Card>
        <div className="card-title"><h3>{monthLabel(month)}</h3><Link href={`/tax?tab=returns&month=${month}`} className="more">Returns →</Link></div>
        {summary ? (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Taxable sales" value={formatINR(Number(dt?.taxable ?? 0) + Number(st?.taxable ?? 0))} />
            <Stat label={`${lab.central} + ${lab.state}`} value={formatINR(tax)} />
            <Stat label="Bills · stays" value={`${dt?.count ?? 0} · ${st?.count ?? 0}`} />
          </div>
        ) : <p className="text-sm text-[var(--color-label-2)]">No figures for this month yet.</p>}
        <p className="footnote mt-3">From paid bills and stay invoices. {scheme === "composition" ? "Under composition you pay 5% of turnover; the tax columns show what was collected, which should be nil." : "These are the figures GSTR-3B table 3.1(a) asks for."}</p>
      </Card>

      <Card>
        <div className="card-title"><h3>Coming up</h3><Link href={`/tax?tab=calendar`} className="more">Calendar →</Link></div>
        {overdue.length > 0 && <div className="flex items-center gap-2 rounded-xl bg-[var(--color-red-2)] text-[var(--color-red)] px-3 py-2 text-sm mb-3"><AlertTriangle size={15} /> {overdue.length} return{overdue.length === 1 ? "" : "s"} overdue and not marked filed.</div>}
        {upcoming.length === 0 ? <p className="text-sm text-[var(--color-label-2)]">Nothing due in this financial year that is not already filed.</p> : (
          <ul className="space-y-2 text-sm">{upcoming.map((c) => <li key={c.form + c.period} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate"><b>{c.form}</b> <span className="text-[var(--color-label-2)]">{c.period}</span></span><span className={cn("num shrink-0", daysBetween(today, c.due) <= 7 && "text-[var(--color-orange)]")}>{day(c.due)}</span></li>)}</ul>
        )}
      </Card>

      <Card>
        <div className="card-title"><h3>Documents</h3><Link href={`/tax?tab=documents`} className="more">All {docsCount} →</Link></div>
        {expiring.length === 0 ? <p className="text-sm text-[var(--color-label-2)]">{docsCount === 0 ? "Nothing on file yet. Start with the GST certificate, PAN and FSSAI licence." : "Nothing expires in the next sixty days."}</p> : (
          <ul className="space-y-2 text-sm">{expiring.map((d, i) => { const left = daysBetween(today, d.expires_on!); return <li key={i} className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{d.title}</span><Pill tone={left < 0 ? "alert" : left <= 14 ? "preparing" : "pending"}>{left < 0 ? `expired ${-left}d ago` : `${left}d left`}</Pill></li>; })}</ul>
        )}
      </Card>
    </div>
  );
}
const Stat = ({ label, value }: { label: string; value: string }) => <div><div className="text-[11px] uppercase tracking-wide text-[var(--color-label-2)]">{label}</div><div className="num text-xl font-semibold mt-0.5">{value}</div></div>;

/* ── Returns: the month's figures in GSTR shape ────────────────────────────── */
function Returns({ r, lab, month, summary, error, go, calendar, status, onFile, pending }: { r: Rest; lab: ReturnType<typeof taxLabels>; month: string; summary: Summary; error: string | null; go: (q: Record<string, string>) => void; calendar: CalendarItem[]; status: (c: CalendarItem) => { kind: string; f?: Filing }; onFile: (c: CalendarItem, filedOn: string, ack: string) => void; pending: boolean }) {
  const rows = [...(summary?.dining ?? []), ...(summary?.stay ?? [])];
  const t = (k: keyof Totals) => Number(summary?.dining_totals?.[k] ?? 0) + Number(summary?.stay_totals?.[k] ?? 0);
  const monthly = calendar.filter((c) => c.period === month && (c.form === "GSTR-1" || c.form === "GSTR-3B"));
  const csv = () => {
    const lines = [["Period", month], ["GSTIN", r.gstin ?? ""], [], ["SAC", "Supply", "Rate %", "Invoices", "Taxable value", lab.central, lab.state, "Invoice value"],
      ...rows.map((x) => [x.sac, x.kind === "dining" ? "Restaurant service" : "Accommodation", x.rate, x.count, n2(x.taxable), n2(x.cgst), n2(x.sgst), n2(x.total)]),
      ["", "Total", "", t("count"), n2(t("taxable")), n2(t("cgst")), n2(t("sgst")), n2(t("total"))], [], ["B2B (recipient GSTIN)", "Name", "Invoices", "Taxable value", lab.central, lab.state, "Invoice value"],
      ...(summary?.b2b ?? []).map((b) => [b.gstin, b.name ?? "", b.count, n2(b.taxable), n2(b.cgst), n2(b.sgst), n2(b.total)])];
    const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `gst-${month}-${(r.gstin ?? r.name).replace(/\W+/g, "")}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="h-10 w-10 grid place-items-center rounded-xl bg-[var(--color-fill)]" onClick={() => go({ month: shiftMonth(month, -1) })} aria-label="Previous month"><ChevronLeft size={16} /></button>
        <h3 className="text-xl min-w-[200px]">{monthLabel(month)}</h3>
        <button className="h-10 w-10 grid place-items-center rounded-xl bg-[var(--color-fill)]" onClick={() => go({ month: shiftMonth(month, 1) })} aria-label="Next month"><ChevronRight size={16} /></button>
        <Button variant="outline" className="ml-auto" onClick={csv} disabled={!summary}><Download size={15} /> CSV for your CA</Button>
      </div>
      {error && <p className="text-sm text-[var(--color-red)]">Could not build the summary: {error}</p>}
      <Card>
        <div className="card-title"><h3>Outward supplies</h3><span className="footnote">GSTR-1 table 7 (B2C) · GSTR-3B table 3.1(a)</span></div>
        <div className="table-wrap"><table className="w-full text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--color-label-2)] border-b border-[var(--color-separator)]"><tr><th className="text-left py-2">SAC</th><th className="text-left py-2">Supply</th><th className="text-right py-2">Rate</th><th className="text-right py-2">Nos.</th><th className="text-right py-2">Taxable</th><th className="text-right py-2">{lab.central}</th><th className="text-right py-2">{lab.state}</th><th className="text-right py-2">Value</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-[var(--color-label-2)]">No paid bills or stay invoices in this month.</td></tr>}
            {rows.map((x, i) => <tr key={i} className="border-b border-[var(--color-separator)]/60"><td className="py-2 num">{x.sac}</td><td className="py-2">{x.kind === "dining" ? "Restaurant service" : "Accommodation"}</td><td className="py-2 text-right num">{x.rate}%</td><td className="py-2 text-right num">{x.count}</td><td className="py-2 text-right num">{n2(x.taxable)}</td><td className="py-2 text-right num">{n2(x.cgst)}</td><td className="py-2 text-right num">{n2(x.sgst)}</td><td className="py-2 text-right num">{n2(x.total)}</td></tr>)}
            {rows.length > 0 && <tr className="font-semibold"><td className="py-2" colSpan={3}>Total</td><td className="py-2 text-right num">{t("count")}</td><td className="py-2 text-right num">{n2(t("taxable"))}</td><td className="py-2 text-right num">{n2(t("cgst"))}</td><td className="py-2 text-right num">{n2(t("sgst"))}</td><td className="py-2 text-right num">{n2(t("total"))}</td></tr>}
          </tbody></table></div>
        <p className="footnote mt-3">Rate is derived from the tax actually charged on each bill, so a bill raised under an earlier rate lands in its own row. Alcohol, if sold, is outside GST and is not here. {lab.state === "UTGST" && "Your state half is UTGST because the property is in a Union Territory."}</p>
      </Card>
      <Card>
        <div className="card-title"><h3>B2B · invoices carrying the guest's GSTIN</h3><span className="footnote">GSTR-1 table 4, invoice by invoice</span></div>
        {(summary?.b2b ?? []).length === 0 ? <p className="text-sm text-[var(--color-label-2)]">None this month. When a company guest wants input credit, raise the tax invoice from Billing and enter their GSTIN; it appears here.</p> : (
          <div className="table-wrap"><table className="w-full text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--color-label-2)] border-b border-[var(--color-separator)]"><tr><th className="text-left py-2">Recipient GSTIN</th><th className="text-left py-2">Name</th><th className="text-right py-2">Nos.</th><th className="text-right py-2">Taxable</th><th className="text-right py-2">{lab.central}</th><th className="text-right py-2">{lab.state}</th><th className="text-right py-2">Value</th></tr></thead>
            <tbody>{summary!.b2b.map((b, i) => <tr key={i} className="border-b border-[var(--color-separator)]/60"><td className="py-2 num">{b.gstin}</td><td className="py-2">{b.name ?? "—"}</td><td className="py-2 text-right num">{b.count}</td><td className="py-2 text-right num">{n2(b.taxable)}</td><td className="py-2 text-right num">{n2(b.cgst)}</td><td className="py-2 text-right num">{n2(b.sgst)}</td><td className="py-2 text-right num">{n2(b.total)}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      {monthly.length > 0 && <Card>
        <div className="card-title"><h3>Filed for {monthLabel(month)}?</h3></div>
        <div className="grid sm:grid-cols-2 gap-3">{monthly.map((c) => <FileRow key={c.form} c={c} st={status(c)} onFile={onFile} pending={pending} />)}</div>
      </Card>}
    </div>
  );
}

/* ── one return: its state, and the way to mark it filed ──────────────────── */
function FileRow({ c, st, onFile, onUndo, pending, today }: { c: CalendarItem; st: { kind: string; f?: Filing; days?: number }; onFile: (c: CalendarItem, filedOn: string, ack: string) => void; onUndo?: (c: CalendarItem) => void; pending: boolean; today?: string }) {
  const [open, setOpen] = useState(false); const [filedOn, setFiledOn] = useState(today ?? new Date().toISOString().slice(0, 10)); const [ack, setAck] = useState("");
  return (
    <div className={cn("rounded-xl border p-3", st.kind === "overdue" ? "border-[var(--color-red)]/50 bg-[var(--color-red-2)]" : st.kind === "filed" ? "border-[var(--color-green)]/40" : "border-[var(--color-separator)]")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm">{c.title}{c.optional && <span className="text-[var(--color-label-3)] font-normal"> · if it applies</span>}</div>
          <div className="text-xs text-[var(--color-label-2)] mt-0.5">{c.period} · due <span className="num">{day(c.due)}</span> · <span className="num">{c.ref}</span></div>
          <div className="text-xs text-[var(--color-label-2)] mt-1">{c.what}</div>
        </div>
        <div className="shrink-0 text-right">
          {st.kind === "filed" ? <Pill tone="ready">filed {st.f?.filed_on ? day(st.f.filed_on) : ""}</Pill> : st.kind === "overdue" ? <Pill tone="alert">{st.days}d overdue</Pill> : <Pill tone="pending">{st.days === 0 ? "today" : `in ${st.days}d`}</Pill>}
        </div>
      </div>
      {st.kind === "filed" ? (
        <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-label-2)]">{st.f?.ack_no && <span className="num">ARN {st.f.ack_no}</span>}{onUndo && <button className="inline-flex items-center gap-1 underline" onClick={() => onUndo(c)} disabled={pending}><Undo2 size={12} /> not filed after all</button>}</div>
      ) : open ? (
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-3 items-end">
          <Field label="Filed on"><input type="date" className="num" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} /></Field>
          <Field label="ARN / acknowledgement"><input className="num" value={ack} onChange={(e) => setAck(e.target.value)} placeholder="optional" /></Field>
          <Button size="sm" disabled={pending} onClick={() => { onFile(c, filedOn, ack); setOpen(false); }}><Check size={14} /> Save</Button>
        </div>
      ) : (
        <div className="flex items-center gap-3 mt-2"><Button size="sm" variant="outline" onClick={() => setOpen(true)}>Mark filed</Button><a href={c.portal} target="_blank" rel="noreferrer" className="text-xs text-[var(--color-label-2)] inline-flex items-center gap-1 hover:underline">Open portal <ExternalLink size={11} /></a></div>
      )}
    </div>
  );
}

/* ── Calendar: the whole financial year ───────────────────────────────────── */
function Calendar({ fy, go, calendar, status, today, onFile, onUndo, pending }: { fy: string; go: (q: Record<string, string>) => void; calendar: CalendarItem[]; status: (c: CalendarItem) => { kind: string; f?: Filing; days?: number }; today: string; onFile: (c: CalendarItem, filedOn: string, ack: string) => void; onUndo: (c: CalendarItem) => void; pending: boolean }) {
  const [showOptional, setShowOptional] = useState(false);
  const y = Number(fy.slice(0, 4));
  const list = calendar.filter((c) => showOptional || !c.optional);
  const byMonth = list.reduce((m, c) => { const k = c.due.slice(0, 7); (m[k] ??= []).push(c); return m; }, {} as Record<string, CalendarItem[]>);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="h-10 w-10 grid place-items-center rounded-xl bg-[var(--color-fill)]" onClick={() => go({ fy: `${y - 1}-${String(y % 100).padStart(2, "0")}` })} aria-label="Previous year"><ChevronLeft size={16} /></button>
        <h3 className="text-xl min-w-[160px]">FY {fy}</h3>
        <button className="h-10 w-10 grid place-items-center rounded-xl bg-[var(--color-fill)]" onClick={() => go({ fy: `${y + 1}-${String((y + 2) % 100).padStart(2, "0")}` })} aria-label="Next year"><ChevronRight size={16} /></button>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={showOptional} onChange={(e) => setShowOptional(e.target.checked)} /> Show items that apply only to some businesses</label>
      </div>
      {Object.entries(byMonth).map(([m, items]) => (
        <div key={m}>
          <div className="eyebrow mb-2">{monthLabel(m)}</div>
          <div className="grid lg:grid-cols-2 gap-3">{items.map((c) => <FileRow key={c.form + c.period} c={c} st={status(c)} onFile={onFile} onUndo={onUndo} pending={pending} today={today} />)}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Documents: the register of certificates and filings ─────────────────── */
function Documents({ docs, today, pending, onSave, onDelete }: { docs: Doc[]; today: string; pending: boolean; onSave: (fd: FormData) => void; onDelete: (id: string) => void }) {
  const [edit, setEdit] = useState<Partial<Doc> | null>(null);
  const kindOf = (k: string) => DOC_KINDS.find((x) => x.key === k);
  const held = new Set(docs.map((d) => d.kind));
  const essentials = DOC_KINDS.filter((k) => ["gst_reg", "pan", "fssai", "trade_licence", "shop_estab"].includes(k.key) && !held.has(k.key));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h3 className="text-xl">On file</h3><Button className="ml-auto" onClick={() => setEdit({ kind: "gst_reg" })}><Plus size={15} /> Add a document</Button></div>
      {essentials.length > 0 && <Card><div className="card-title"><h3>Not on file yet</h3></div><div className="flex flex-wrap gap-2">{essentials.map((k) => <button key={k.key} className="chip" onClick={() => setEdit({ kind: k.key, title: k.label })}>+ {k.label}</button>)}</div></Card>}
      {docs.length === 0 ? <p className="text-sm text-[var(--color-label-2)]">Nothing here yet. Add the number, the dates and a link to where the signed copy lives — DigiLocker, Drive, or your CA's portal — so anyone at the counter can find it when an officer asks.</p> : (
        <div className="grid md:grid-cols-2 gap-3">{docs.map((d) => { const k = kindOf(d.kind); const left = d.expires_on ? daysBetween(today, d.expires_on) : null; return (
          <Card key={d.id}>
            <div className="flex items-start gap-3">
              <span className="h-10 w-10 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0"><FileText size={17} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{d.title}</div>
                <div className="text-xs text-[var(--color-label-2)] truncate">{k?.label ?? d.kind}{d.number && <> · <span className="num">{d.number}</span></>}{d.period && ` · ${d.period}`}</div>
                <div className="text-xs text-[var(--color-label-2)] mt-1">{d.issuer && `${d.issuer} · `}{d.issued_on && `issued ${day(d.issued_on)}`}{d.expires_on && ` · expires ${day(d.expires_on)}`}</div>
                {d.notes && <div className="text-xs mt-1">{d.notes}</div>}
                <div className="flex items-center gap-3 mt-2 text-xs">{d.url && <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--color-tint)] hover:underline">Open copy <ExternalLink size={11} /></a>}<button className="underline text-[var(--color-label-2)]" onClick={() => setEdit(d)}>Edit</button><button className="underline text-[var(--color-label-2)] hover:text-[var(--color-red)]" disabled={pending} onClick={() => { if (confirm(`Remove "${d.title}" from the register?`)) onDelete(d.id); }}>Remove</button></div>
              </div>
              {left !== null && <Pill tone={left < 0 ? "alert" : left <= 30 ? "preparing" : "ready"}>{left < 0 ? "expired" : left <= 60 ? `${left}d` : "valid"}</Pill>}
            </div>
          </Card>); })}</div>
      )}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Edit document" : "Add a document"}>
        <form className="space-y-4" action={(fd) => { onSave(fd); setEdit(null); }}>
          {edit?.id && <input type="hidden" name="id" value={edit.id} />}
          <Field label="What is it" hint={kindOf(edit?.kind ?? "other")?.hint}><select name="kind" defaultValue={edit?.kind ?? "gst_reg"} onChange={(e) => setEdit({ ...edit, kind: e.target.value, title: edit?.title || kindOf(e.target.value)?.label })}>{DOC_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></Field>
          <Field label="Title"><input name="title" defaultValue={edit?.title ?? ""} required placeholder="e.g. FSSAI state licence 2025-30" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Number"><input name="number" className="num" defaultValue={edit?.number ?? ""} /></Field><Field label="Issued by"><input name="issuer" defaultValue={edit?.issuer ?? ""} placeholder="FSSAI · Commercial Taxes Dept · Corporation" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Issued on"><input name="issued_on" type="date" className="num" defaultValue={edit?.issued_on ?? ""} /></Field><Field label="Expires on" hint="Leave blank for a document that does not expire"><input name="expires_on" type="date" className="num" defaultValue={edit?.expires_on ?? ""} /></Field></div>
          <Field label="Period" hint="For a return or a yearly filing: FY 2025-26, 2026-08, Q1 2026-27"><input name="period" className="num" defaultValue={edit?.period ?? ""} /></Field>
          <Field label="Link to the signed copy" hint="DigiLocker, Google Drive, your CA's portal — anywhere the PDF lives"><input name="url" defaultValue={edit?.url ?? ""} placeholder="https://…" /></Field>
          <Field label="Notes"><input name="notes" defaultValue={edit?.notes ?? ""} /></Field>
          <Button className="w-full" disabled={pending}>Save</Button>
        </form>
      </Sheet>
    </div>
  );
}

/* ── Profile: how the property is registered, and who signs for it ───────── */
function Profile({ r, role, pending, onSave }: { r: Rest; role: string; pending: boolean; onSave: (fd: FormData) => void }) {
  const [scheme, setScheme] = useState(r.gst_scheme ?? "regular");
  return (
    <form className="grid lg:grid-cols-2 gap-4 items-start" action={onSave}>
      <input type="hidden" name="id" value={r.id} />
      <Card>
        <div className="card-title"><h3><Landmark size={18} className="inline mr-2 -mt-1" />GST registration</h3></div>
        <div className="space-y-4">
          <Field label="Scheme" hint={scheme === "composition" ? "You pay 5% of turnover, cannot charge GST on bills, and print a bill of supply. Set the dining GST rate in Settings to 0." : scheme === "unregistered" ? "Below the threshold, or not yet registered. Bills print without tax lines." : "You charge GST on every bill and file GSTR-1 and GSTR-3B."}>
            <select name="gst_scheme" value={scheme} onChange={(e) => setScheme(e.target.value)}><option value="regular">Regular</option><option value="composition">Composition (Sec 10)</option><option value="unregistered">Not registered</option></select></Field>
          {scheme === "regular" && <Field label="Filing period" hint="Quarterly (QRMP) may be chosen up to ₹5 crore turnover"><select name="gst_period" defaultValue={r.gst_monthly === false ? "quarterly" : "monthly"}><option value="monthly">Monthly</option><option value="quarterly">Quarterly (QRMP)</option></select></Field>}
          <Field label="GSTIN" hint="15 characters. The state code and the PAN are read from it."><input name="gstin" className="num uppercase" defaultValue={r.gstin ?? ""} placeholder="33ABCDE1234F1Z5" maxLength={15} /></Field>
          <Field label="Legal name" hint="As on the certificate, if it differs from the name on the sign"><input name="legal_name" defaultValue={r.legal_name ?? ""} placeholder={r.name} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PAN"><input name="pan" className="num uppercase" defaultValue={r.pan ?? ""} placeholder="ABCDE1234F" maxLength={10} /></Field>
            <Field label="State"><select name="gst_state_code" defaultValue={r.gst_state_code ?? ""}><option value="">From the GSTIN</option>{Object.entries(GST_STATES).map(([c, s]) => <option key={c} value={c}>{c} · {s.name}</option>)}</select></Field>
          </div>
          <Field label="FSSAI licence number" hint="14 digits. Printed on every bill once entered."><input name="fssai_no" className="num" defaultValue={r.fssai_no ?? ""} maxLength={14} /></Field>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <div className="card-title"><h3><UserRound size={18} className="inline mr-2 -mt-1" />Chartered Accountant</h3></div>
          <div className="space-y-4">
            <Field label="Name"><input name="ca_name" defaultValue={r.ca_name ?? ""} /></Field>
            <Field label="Firm"><input name="ca_firm" defaultValue={r.ca_firm ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="ICAI membership no."><input name="ca_membership_no" className="num" defaultValue={r.ca_membership_no ?? ""} /></Field><Field label="Phone"><input name="ca_phone" className="num" defaultValue={r.ca_phone ?? ""} /></Field></div>
            <Field label="Email"><input name="ca_email" type="email" defaultValue={r.ca_email ?? ""} /></Field>
          </div>
        </Card>
        <Button className="w-full" size="lg" disabled={pending || !["owner", "manager"].includes(role)}>Save</Button>
        {!["owner", "manager"].includes(role) && <p className="footnote text-center">Only the owner or a manager can change these.</p>}
      </div>
    </form>
  );
}
