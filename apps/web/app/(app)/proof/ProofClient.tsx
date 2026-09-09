"use client";
import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Link2, Copy, Printer, Plus, Ban, Eye, Landmark, Truck, Building2, Briefcase, Lock, FileCheck2 } from "lucide-react";
import { Button, Card, Field, Pill, StatTile, Sheet, cn, Empty } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatINR } from "@/lib/format";
import { sealAll, createLink, revokeLink } from "./actions";

type P = { period: string; rooms_revenue: number; dining_revenue: number; delivery_revenue: number; total_revenue: number; gst_collected: number; supplier_paid: number; wages_paid: number; covers: number; invoices_issued: number; occupancy_pct: number | null; avg_ticket: number | null; days_traded: number; hash: string };
type Rec = { property: { name: string; address: string | null; gstin: string | null; type: string; since: string }; from: string; to: string; months: number; periods: P[]; total_revenue: number; gst_collected: number; avg_monthly: number; verification: { periods: number; intact: boolean; broken: { period: string; reason: string }[]; head: string | null } };
type L = { id: string; token: string; label: string; purpose: string; from_period: string; to_period: string; show_costs: boolean; expires_at: string; revoked: boolean; created_at: string; views: number; last_viewed: string | null };

const PURPOSE = { bank: { l: "Bank / loan", Icon: Landmark }, supplier: { l: "Supplier credit", Icon: Truck }, landlord: { l: "Landlord", Icon: Building2 }, investor: { l: "Investor", Icon: Briefcase }, other: { l: "Other", Icon: FileCheck2 } } as const;
const mon = (d: string) => new Date(d).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

export function ProofClient({ base, record, links, restaurant }: { base: string; record: Rec; links: L[]; restaurant: { name: string } }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const periods = record?.periods ?? [];
  const v = record?.verification;
  const growth = useMemo(() => {
    if (periods.length < 4) return null;
    const half = Math.floor(periods.length / 2);
    const early = periods.slice(0, half).reduce((t, p) => t + Number(p.total_revenue), 0) / half;
    const late = periods.slice(-half).reduce((t, p) => t + Number(p.total_revenue), 0) / half;
    return early > 0 ? Math.round(((late - early) / early) * 100) : null;
  }, [periods]);
  const max = Math.max(...periods.map((p) => Number(p.total_revenue)), 1);

  return (
    <>
      <PageHeader eyebrow="Your trading history, in a form a bank will read" title="Proof of" accent="business"
        sub="Every month you trade, DineFlow seals the figures and chains them together. Share them with a link only you control."
        actions={<div className="flex gap-2 no-print">
          <Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Print</Button>
          <Button onClick={() => setSheet(true)}><Link2 size={16} /> Share a record</Button>
        </div>} />

      {msg && <div className="feather p-3 mb-4 text-sm flex items-center gap-2 border-mint">{msg}</div>}
      {err && <p className="text-sm text-chili mb-4">{err}</p>}

      {periods.length === 0 ? (
        <Empty title="No months sealed yet" hint="A month can be sealed once it has ended. Press below and DineFlow seals every closed month you have traded."
          action={<Button disabled={pending} onClick={() => start(async () => { const r = await sealAll(); if ("error" in r) setErr(r.error!); else setMsg(`${r.sealed} month(s) sealed.`); })}>Seal my trading history</Button>} />
      ) : (<>
        {/* verification banner — the whole point of the feature */}
        <Card className={cn("flex items-start gap-3 mb-5", v?.intact ? "!bg-mint-2 border-mint" : "!bg-chili-2 border-chili")}>
          {v?.intact ? <ShieldCheck size={20} className="shrink-0 mt-0.5" /> : <ShieldAlert size={20} className="shrink-0 mt-0.5 text-chili" />}
          <div className="text-sm flex-1">
            {v?.intact ? <><b>{v.periods} months sealed and verified.</b> Each month&apos;s figures were fingerprinted when the month closed and chained to the one before it. Nothing has been altered since.</>
              : <><b className="text-chili">The chain is broken.</b> {v?.broken.map((b) => `${mon(b.period)}: ${b.reason}`).join(" · ")}. A reader of your record will be shown this too — that is what makes an intact chain worth something.</>}
            {v?.head && <div className="num text-[11px] text-steel mt-1.5 break-all">Head fingerprint {v.head.slice(0, 32)}…</div>}
          </div>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await sealAll(); if ("error" in r) setErr(r.error!); else setMsg(r.sealed ? `${r.sealed} new month(s) sealed.` : "Already up to date."); })}>Seal new months</Button>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <StatTile label="Verified turnover" value={formatINR(record.total_revenue)} sub={`${record.months} months to ${mon(record.to)}`} />
          <StatTile label="Average month" value={formatINR(record.avg_monthly)} delay={0.05} />
          <StatTile label="GST collected" value={formatINR(record.gst_collected)} sub="paid to government" delay={0.1} />
          <StatTile label="Growth" value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`} sub="first half vs second half" tone={growth !== null && growth > 0 ? "good" : undefined} delay={0.15} />
        </div>

        {/* the chart a lender actually wants */}
        <Card className="mb-4">
          <h2 className="text-2xl mb-1">Month by month</h2>
          <p className="text-xs text-steel mb-5">Rooms, dining and delivery, separated. Sealed figures, not a live query.</p>
          <div className="flex items-end gap-1.5 h-48 overflow-x-auto pb-1">
            {periods.map((p, i) => (
              <motion.div key={p.period} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="flex-1 min-w-[26px] flex flex-col items-center gap-1 group">
                <div className="w-full flex flex-col justify-end h-40 rounded-t overflow-hidden" title={`${mon(p.period)} — ${formatINR(p.total_revenue)}`}>
                  <div className="w-full bg-champagne" style={{ height: `${(Number(p.delivery_revenue) / max) * 100}%` }} />
                  <div className="w-full bg-saffron" style={{ height: `${(Number(p.dining_revenue) / max) * 100}%` }} />
                  <div className="w-full bg-ink" style={{ height: `${(Number(p.rooms_revenue) / max) * 100}%` }} />
                </div>
                <span className="text-[9px] text-steel num rotate-0 whitespace-nowrap">{mon(p.period).split(" ")[0]}</span>
              </motion.div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-steel">
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-ink" /> rooms</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-saffron" /> dining</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-champagne" /> delivery</span>
          </div>
        </Card>

        <Card className="mb-4">
          <div className="overflow-x-auto table-wrap"><table className="w-full text-sm min-w-[860px]">
            <thead className="text-xs uppercase tracking-wide text-steel border-b border-line"><tr>
              <th className="text-left py-2">Month</th><th className="text-right py-2">Rooms</th><th className="text-right py-2">Dining</th><th className="text-right py-2">Delivery</th>
              <th className="text-right py-2">Total</th><th className="text-right py-2">GST</th><th className="text-right py-2">Occupancy</th><th className="text-right py-2">Covers</th>
              <th className="text-right py-2">Suppliers</th><th className="text-right py-2">Wages</th><th className="text-right py-2">Seal</th></tr></thead>
            <tbody>{periods.slice().reverse().map((p) => (
              <tr key={p.period} className="border-b border-line/60">
                <td className="py-2.5 font-medium">{mon(p.period)}<div className="text-[11px] text-steel">{p.days_traded} days traded</div></td>
                <td className="py-2.5 text-right num">{Number(p.rooms_revenue) ? formatINR(p.rooms_revenue) : "—"}</td>
                <td className="py-2.5 text-right num">{formatINR(p.dining_revenue)}</td>
                <td className="py-2.5 text-right num">{Number(p.delivery_revenue) ? formatINR(p.delivery_revenue) : "—"}</td>
                <td className="py-2.5 text-right num font-semibold">{formatINR(p.total_revenue)}</td>
                <td className="py-2.5 text-right num text-steel">{formatINR(p.gst_collected)}</td>
                <td className="py-2.5 text-right num">{p.occupancy_pct != null ? `${p.occupancy_pct}%` : "—"}</td>
                <td className="py-2.5 text-right num">{p.covers}</td>
                <td className="py-2.5 text-right num text-steel">{formatINR(p.supplier_paid)}</td>
                <td className="py-2.5 text-right num text-steel">{formatINR(p.wages_paid)}</td>
                <td className="py-2.5 text-right num text-[10px] text-steel">{p.hash?.slice(0, 8)}</td>
              </tr>))}</tbody>
          </table></div>
        </Card>
      </>)}

      {/* links */}
      <Card>
        <div className="flex items-center justify-between mb-1"><h2 className="text-2xl">Who you have shared it with</h2><Button size="sm" onClick={() => setSheet(true)} className="no-print"><Plus size={15} /> New link</Button></div>
        <p className="text-xs text-steel mb-4">Each link opens a read-only record with no login. It expires on its own, you can revoke it any time, and you see every time it was opened.</p>
        {links.length === 0 ? <p className="text-sm text-steel">No links yet. A bank, a supplier asking for credit terms, or a landlord reviewing your rent — each gets their own link.</p> : (
          <div className="divide-y divide-line">
            {links.map((l) => {
              const P = PURPOSE[(l.purpose as keyof typeof PURPOSE)] ?? PURPOSE.other;
              const dead = l.revoked || new Date(l.expires_at) < new Date();
              const url = `${base}/record/${l.token}`;
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", dead ? "bg-porcelain-2 text-steel" : "bg-ink text-champagne")}><P.Icon size={16} /></span>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold flex items-center gap-2">{l.label} {dead && <Pill tone="served">{l.revoked ? "revoked" : "expired"}</Pill>}</div>
                    <div className="text-xs text-steel">{P.l} · {mon(l.from_period)} – {mon(l.to_period)} · {l.show_costs ? "with costs" : "revenue only"} · expires {new Date(l.expires_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <div className="text-xs text-steel flex items-center gap-1.5"><Eye size={13} /> {l.views} open{l.views === 1 ? "" : "s"}{l.last_viewed && ` · last ${new Date(l.last_viewed).toLocaleDateString("en-IN")}`}</div>
                  {!dead && <>
                    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); setMsg("Link copied"); }}><Copy size={14} /> Copy</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Revoke "${l.label}"? Anyone holding it loses access immediately.`)) start(async () => { await revokeLink(l.id); setMsg("Revoked"); }); }}><Ban size={14} /></Button>
                  </>}
                </div>);
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-steel mt-4 flex items-start gap-1.5"><Lock size={13} className="mt-0.5 shrink-0" /> This record is yours. DineFlow does not send it anywhere, does not score you, and does not show it to lenders unless you create a link and hand it over yourself.</p>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Share your business record">
        <NewLink periods={periods} onDone={(t, label) => { setSheet(false); navigator.clipboard.writeText(`${base}/record/${t}`); setMsg(`"${label}" created and copied to the clipboard.`); }} onError={setErr} />
      </Sheet>
    </>
  );
}

function NewLink({ periods, onDone, onError }: { periods: P[]; onDone: (token: string, label: string) => void; onError: (e: string) => void }) {
  const first = periods[0]?.period ?? new Date().toISOString().slice(0, 10);
  const last = periods.at(-1)?.period ?? first;
  const [f, setF] = useState({ label: "For the bank", purpose: "bank", from: first, to: last, days: 30, showCosts: true });
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Field label="What is it for"><div className="grid grid-cols-2 gap-2">
        {Object.entries(PURPOSE).map(([k, { l, Icon }]) => (
          <button key={k} onClick={() => setF({ ...f, purpose: k, label: k === "bank" ? "For the bank" : k === "supplier" ? "For my supplier" : k === "landlord" ? "For my landlord" : f.label })}
            className={cn("feather feather-lift flex items-center gap-2 p-3 text-sm font-semibold", f.purpose === k && "!border-saffron shadow-glow")}><Icon size={16} /> {l}</button>
        ))}
      </div></Field>
      <Field label="Label (only you see this)"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From"><select value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}>{periods.map((p) => <option key={p.period} value={p.period}>{mon(p.period)}</option>)}</select></Field>
        <Field label="To"><select value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>{periods.map((p) => <option key={p.period} value={p.period}>{mon(p.period)}</option>)}</select></Field>
      </div>
      <Field label="Link expires in"><div className="flex gap-2">{[7, 30, 90, 180].map((d) => <button key={d} onClick={() => setF({ ...f, days: d })} className={cn("chip", f.days === d && "on")}>{d} days</button>)}</div></Field>
      <label className={cn("feather p-3 flex gap-3 cursor-pointer text-sm", f.showCosts && "border-mint")}>
        <input type="checkbox" checked={f.showCosts} onChange={(e) => setF({ ...f, showCosts: e.target.checked })} className="!w-auto mt-0.5" />
        <span><b>Include supplier and wage costs</b><br /><span className="text-steel text-xs">A lender assessing margin will want these. A supplier negotiating with you probably should not see them.</span></span>
      </label>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await createLink(f); if ("error" in r) onError(r.error!); else onDone(r.link!.token, f.label); })}>Create link</Button>
    </div>
  );
}
