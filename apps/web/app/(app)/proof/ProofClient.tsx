"use client";
import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, Link2, Copy, Printer, Plus, Ban, Eye, Landmark, Truck, Building2, Briefcase, Lock, FileCheck2 } from "lucide-react";
import { Button, Card, Field, Pill, StatTile, Sheet, cn, Empty } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatINR } from "@/lib/format";
import { sealAll, createLink, revokeLink } from "./actions";
import { copyText } from "@/lib/clipboard";
import { EmptyState } from "@/components/ui/EmptyState";

type P = { period: string; rooms_revenue: number; dining_revenue: number; delivery_revenue: number; total_revenue: number; gst_collected: number; supplier_paid: number; wages_paid: number; covers: number; invoices_issued: number; occupancy_pct: number | null; avg_ticket: number | null; days_traded: number; hash: string };
type Rec = { property: { name: string; address: string | null; gstin: string | null; type: string; since: string }; from: string; to: string; months: number; periods: P[]; total_revenue: number; gst_collected: number; avg_monthly: number; verification: { periods: number; intact: boolean; broken: { period: string; reason: string }[]; head: string | null } };
type L = { id: string; token: string; label: string; purpose: string; from_period: string; to_period: string; show_costs: boolean; expires_at: string; revoked: boolean; created_at: string; views: number; last_viewed: string | null };

const PURPOSE = { bank: { l: "Bank / loan", Icon: Landmark }, supplier: { l: "Supplier credit", Icon: Truck }, landlord: { l: "Landlord", Icon: Building2 }, investor: { l: "Investor", Icon: Briefcase }, other: { l: "Other", Icon: FileCheck2 } } as const;
const mon = (d: string) => new Date(d).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

export function ProofClient({ base, record, links }: { base: string; record: Rec; links: L[]; restaurant: { name: string } }) {
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
      <PageHeader eyebrow="Trading history for your bank" title="Proof of" accent="business"
        sub="Sealed monthly figures, shared by link"
        actions={<div className="flex gap-2 no-print">
          <Button variant="outline" onClick={() => window.print()}><Printer size={16} /> Print</Button>
          <Button onClick={() => setSheet(true)}><Link2 size={16} /> Share a record</Button>
        </div>} />

      {msg && <div className="feather p-3 mb-4 text-sm flex items-center gap-2 border-mint">{msg}</div>}
      {err && <p className="text-sm text-chili mb-4">{err}</p>}

      {periods.length === 0 ? (
        <>
        {/* phones as they were; iPad and up the empty panel (2026-10-24, the owner — desktop and iPad only) */}
        <div className="md:hidden"><Empty title="No months sealed yet" hint="Months seal after they end"
          action={<Button disabled={pending} onClick={() => start(async () => { const r = await sealAll(); if ("error" in r) setErr(r.error!); else setMsg(`${r.sealed} month(s) sealed.`); })}>Seal my trading history</Button>} /></div>
        <div className="hidden md:block"><EmptyState icon={ShieldCheck} hue="blue" title="No months sealed yet" data-proof-empty
          hint="Each finished month's sales are sealed so nobody can change them — a record your bank, a supplier or a landlord can trust. Seal the months you already have now."
          actions={<Button disabled={pending} onClick={() => start(async () => { const r = await sealAll(); if ("error" in r) setErr(r.error!); else setMsg(`${r.sealed} month(s) sealed.`); })}><Lock size={16} /> Seal my trading history</Button>} /></div>
        </>
      ) : (<>
        {/* verification banner — the whole point of the feature */}
        <Card className={cn("flex flex-wrap sm:flex-nowrap items-start gap-3 mb-5", v?.intact ? "!bg-mint-2 border-mint" : "!bg-chili-2 border-chili")}>
          {v?.intact ? <ShieldCheck size={20} className="shrink-0 mt-0.5" /> : <ShieldAlert size={20} className="shrink-0 mt-0.5 text-chili" />}
          <div className="text-sm flex-1 min-w-[12rem]">
            {v?.intact ? <><b>{v.periods} months sealed and verified.</b> Unchanged since sealing.</>
              : <><b className="text-chili">The chain is broken.</b> {v?.broken.map((b) => `${mon(b.period)}: ${b.reason}`).join(" · ")}. Your links show this too.</>}
            {v?.head && <div className="num text-[11px] text-steel mt-1.5 break-all">Head fingerprint {v.head.slice(0, 32)}…</div>}
          </div>
          <Button size="sm" variant="outline" className="shrink-0 ml-auto" disabled={pending} onClick={() => start(async () => { const r = await sealAll(); if ("error" in r) setErr(r.error!); else setMsg(r.sealed ? `${r.sealed} new month(s) sealed.` : "Already up to date."); })}>Seal new months</Button>
        </Card>

        <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 mb-5">
          <StatTile label="Verified turnover" value={formatINR(record.total_revenue)} sub={`${record.months} months to ${mon(record.to)}`} />
          <StatTile label="Average month" value={formatINR(record.avg_monthly)} delay={0.05} />
          <StatTile label="GST collected" value={formatINR(record.gst_collected)} sub="paid to government" delay={0.1} />
          <StatTile label="Growth" value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`} sub="first half vs second half" tone={growth !== null && growth > 0 ? "good" : undefined} delay={0.15} />
        </div>

        {/* the chart a lender actually wants */}
        <Card className="mb-4">
          <h2 className="text-2xl mb-1">Month by month</h2>
          <p className="text-xs text-steel mb-5">Rooms, dining and delivery, from sealed figures.</p>
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
        {/* the head: an icon, the title and what a link is, and New link — beside them on a wide card, its own full
            row on a phone (2026-10-21; the title wrapped to two big lines beside a squeezed button) */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 mb-4" data-links-head>
          <div className="flex items-start gap-3 min-w-0 flex-1 basis-[16rem]">
            <span className="h-11 w-11 shrink-0 rounded-[12px] grid place-items-center bg-[color-mix(in_srgb,var(--color-blue)_16%,transparent)] text-[var(--color-blue)]" aria-hidden><Link2 size={19} /></span>
            <div className="min-w-0">
              <h2 className="text-[21px] leading-tight">Who you have shared it with</h2>
              <p className="mt-1 text-[12.5px] text-steel leading-snug">View-only, no login · revoke any time</p>
            </div>
          </div>
          <button type="button" onClick={() => setSheet(true)} className="no-print svc-btn go sm !px-4 shrink-0 max-sm:w-full" data-new-link><Plus size={17} strokeWidth={2.4} aria-hidden /> New link</button>
        </div>
        {links.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--color-separator)] p-4" data-links-empty>
            <p className="text-[13.5px] text-[var(--color-label-2)]">One link each: bank, supplier, landlord</p>
            <div className="mt-3 grid grid-cols-3 gap-2" aria-hidden>
              {(["bank", "supplier", "landlord"] as const).map((k) => { const { l, Icon } = PURPOSE[k]; return (
                <div key={k} className="min-w-0 rounded-xl bg-[var(--color-fill)] px-2 py-2.5 flex flex-col items-center gap-1.5 text-center">
                  <Icon size={17} className="text-[var(--color-label-2)]" /><span className="text-[11.5px] font-semibold text-steel leading-tight">{l}</span>
                </div>); })}
            </div>
          </div>) : (
          <div className="divide-y divide-line">
            {links.map((l) => {
              const P = PURPOSE[(l.purpose as keyof typeof PURPOSE)] ?? PURPOSE.other;
              const dead = l.revoked || new Date(l.expires_at) < new Date();
              const url = `${base}/record/${l.token}`;
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", dead ? "bg-porcelain-2 text-steel" : "bg-ink text-on-label")}><P.Icon size={16} /></span>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold flex items-center gap-2">{l.label} {dead && <Pill tone="served">{l.revoked ? "revoked" : "expired"}</Pill>}</div>
                    <div className="text-xs text-steel">{P.l} · {mon(l.from_period)} – {mon(l.to_period)} · {l.show_costs ? "with costs" : "revenue only"} · expires {new Date(l.expires_at).toLocaleDateString("en-IN")}</div>
                  </div>
                  <div className="text-xs text-steel flex items-center gap-1.5"><Eye size={13} /> {l.views} open{l.views === 1 ? "" : "s"}{l.last_viewed && ` · last ${new Date(l.last_viewed).toLocaleDateString("en-IN")}`}</div>
                  {!dead && <>
                    <Button size="sm" variant="outline" onClick={() => { copyText(url); setMsg("Link copied"); }}><Copy size={14} /> Copy</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Revoke "${l.label}"? Anyone holding it loses access immediately.`)) start(async () => { const r = await revokeLink(l.id); if ("error" in r) setErr(r.error!); else setMsg("Revoked"); }); }}><Ban size={14} /></Button>
                  </>}
                </div>);
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-steel mt-4 flex items-start gap-1.5"><Lock size={13} className="mt-0.5 shrink-0" /> Only you share it — DineFlow never does.</p>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Share your business record">
        <NewLink periods={periods} onDone={(t, label) => { setSheet(false); copyText(`${base}/record/${t}`); setMsg(`"${label}" created and copied to the clipboard.`); }} onError={setErr} />
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
    <input type="checkbox" checked={f.showCosts} onChange={(e) => setF({ ...f, showCosts: e.target.checked })} className="mt-0.5" />
        <span><b>Include supplier and wage costs</b><br /><span className="text-steel text-xs">For a bank, not a supplier</span></span>
      </label>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await createLink(f); if ("error" in r) onError(r.error!); else onDone(r.link!.token, f.label); })}>Create link</Button>
    </div>
  );
}
