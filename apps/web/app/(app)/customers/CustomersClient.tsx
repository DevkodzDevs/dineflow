"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Search, MessageCircle, Download, Gift, Coins, Pencil, Cake, Heart } from "lucide-react";
import { Button, Card, Field, Sheet, Empty, Pill, StatTile, cn, useToast } from "@/components/ui";
import { formatINR, fmtDate } from "@/lib/format";
import { saveCustomer, adjustPoints, customerHistory, type HistoryRow } from "./actions";

export type Overview = { total?: number; new_30d?: number; returning?: number; lapsed_60d?: number; points_out?: number; spend_30d?: number; soon?: { id: string; name: string | null; phone: string; what: string; on: string }[] };
type Customer = { id: string; phone: string; name: string | null; email: string | null; birthday: string | null; anniversary: string | null; tags: string[]; notes: string | null; visits: number; total_spend: number; points: number; first_visit_at: string; last_visit_at: string | null };
type Loyalty = { enabled: boolean; earnPct: number; pointValue: number; minRedeem: number };

/** A WhatsApp link to a guest with a message already typed. No API, no cost: it opens the app on this phone. */
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}`;
const first = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "there";
const since = (iso: string | null) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null);

export function CustomersClient({ overview: ov, customers, loyalty, restaurant }: { overview: Overview; customers: Customer[]; loyalty: Loyalty; restaurant: string }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "regulars" | "lapsed" | "new" | "points">("all");
  const [open, setOpen] = useState<Customer | null>(null);
  const [adding, setAdding] = useState(false);
  const digits = q.replace(/\D/g, "");
  const list = useMemo(() => customers.filter((c) => {
    if (q && !(c.name ?? "").toLowerCase().includes(q.toLowerCase()) && !(digits && c.phone.includes(digits))) return false;
    if (filter === "regulars") return c.visits >= 3;
    if (filter === "lapsed") { const d = since(c.last_visit_at); return c.visits >= 2 && d !== null && d >= 60; }
    if (filter === "new") return since(c.first_visit_at)! <= 30;
    if (filter === "points") return Number(c.points) >= loyalty.minRedeem;
    return true;
  }), [customers, q, digits, filter, loyalty.minRedeem]);

  const exportCsv = () => {
    const rows = [["name", "phone", "email", "visits", "total_spend", "points", "last_visit", "birthday", "anniversary", "tags"], ...list.map((c) => [c.name ?? "", c.phone, c.email ?? "", c.visits, c.total_spend, c.points, c.last_visit_at ?? "", c.birthday ?? "", c.anniversary ?? "", c.tags.join(" ")])];
    const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Customers" value={String(ov.total ?? customers.length)} sub={`${ov.new_30d ?? 0} new in 30 days`} />
        <StatTile label="Came back" value={String(ov.returning ?? 0)} sub={`${ov.lapsed_60d ?? 0} not seen in 60 days`} tone={(ov.lapsed_60d ?? 0) > 0 ? "alert" : "good"} delay={0.05} />
        <StatTile label="Spent · 30 days" value={formatINR(Number(ov.spend_30d ?? 0))} sub="by known guests" delay={0.1} />
        <StatTile label="Points outstanding" value={String(Math.round(Number(ov.points_out ?? 0)))} sub={loyalty.enabled ? `worth ${formatINR(Number(ov.points_out ?? 0) * loyalty.pointValue)}` : "loyalty is off · Settings → Payments"} delay={0.15} />
      </div>

      {(ov.soon?.length ?? 0) > 0 && (
        <Card>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-steel mb-2"><Cake size={13} /> Occasions in the next two weeks</div>
          <div className="flex flex-wrap gap-2">
            {ov.soon!.map((s, i) => (
              <a key={i} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-3 py-2 text-sm flex items-center gap-2 hover:bg-porcelain"
                href={waLink(s.phone, `Hi ${first(s.name)}! Everyone at ${restaurant} wishes you a very happy ${s.what}${s.what === "birthday" ? " 🎂" : " 💐"}. Come and celebrate with us — dessert is on the house.`)}>
                <span className="font-medium">{s.name ?? s.phone}</span><span className="text-steel">· {s.what} · {s.on}</span><MessageCircle size={13} className="text-mint" />
              </a>
            ))}
          </div>
        </Card>
      )}

      <div className="toolbar"><div className="toolbar-group">
        {([["all", "All"], ["regulars", "Regulars"], ["new", "New"], ["lapsed", "Not seen lately"], ["points", "Can redeem"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full px-4 h-9 text-sm font-semibold transition", filter === k ? "bg-ink text-on-label" : "bg-card border border-line hover:bg-porcelain")}>{label}</button>
        ))}
        </div><div className="toolbar-group toolbar-end">
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" /><input className="!pl-9 !w-52" placeholder="Name or phone" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Button variant="outline" onClick={exportCsv} disabled={!list.length} title="Download what is listed as a CSV"><Download size={16} /> CSV</Button>
          <Button onClick={() => setAdding(true)}><Plus size={16} /> Customer</Button>
        </div>
      </div>

      {customers.length === 0 ? (
        <Empty title="No customers yet" hint="A phone number on an order or a bill becomes a customer here — visits, spend and points build up on their own." action={<Button onClick={() => setAdding(true)}>Add one by hand</Button>} />
      ) : list.length === 0 ? <Empty title="Nobody matches" hint="Try another name, or clear the filter." /> : (
        <div className="feather overflow-x-auto table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-porcelain text-xs uppercase tracking-wide text-steel"><tr><th className="text-left px-4 py-3">Guest</th><th className="text-right px-4 py-3">Visits</th><th className="text-right px-4 py-3 hidden sm:table-cell">Spent</th><th className="text-right px-4 py-3">Points</th><th className="text-left px-4 py-3 hidden md:table-cell">Last visit</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {list.map((c, i) => {
                const d = since(c.last_visit_at);
                return (
                  <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 20) * 0.02 }} className="border-t border-line hover:bg-porcelain/60 cursor-pointer" onClick={() => setOpen(c)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold flex items-center gap-2 flex-wrap">{c.name ?? <span className="text-steel">No name</span>}
                        {c.visits >= 3 && <Pill tone="gold"><Heart size={10} /> regular</Pill>}
                        {c.tags.map((t) => <span key={t} className="text-[10px] rounded-full bg-[var(--color-fill)] px-2 py-0.5 text-steel">{t}</span>)}</div>
                      <div className="num text-xs text-steel">{c.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right num font-semibold">{c.visits}</td>
                    <td className="px-4 py-3 text-right num hidden sm:table-cell">{formatINR(Number(c.total_spend))}</td>
                    <td className={cn("px-4 py-3 text-right num", Number(c.points) >= loyalty.minRedeem ? "font-semibold text-mint" : "text-steel")}>{Math.round(Number(c.points))}</td>
                    <td className={cn("px-4 py-3 hidden md:table-cell", d !== null && d >= 60 && "text-chili")}>{c.last_visit_at ? `${fmtDate(c.last_visit_at)} · ${d} day${d === 1 ? "" : "s"} ago` : "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <a href={waLink(c.phone, `Hi ${first(c.name)}, ${restaurant} here.`)} target="_blank" rel="noreferrer" className="inline-grid h-8 w-8 place-items-center rounded-lg text-steel hover:text-mint" aria-label="WhatsApp"><MessageCircle size={15} /></a>
                      <button onClick={() => setOpen(c)} className="inline-grid h-8 w-8 place-items-center rounded-lg text-steel hover:text-ink" aria-label="Open"><Pencil size={15} /></button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? open?.phone ?? ""} wide>
        {open && <CustomerSheet key={open.id} c={open} loyalty={loyalty} restaurant={restaurant} onDone={() => setOpen(null)} />}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="New customer">
        <CustomerForm onDone={() => setAdding(false)} />
      </Sheet>
    </div>
  );
}

function CustomerForm({ c, onDone }: { c?: Customer; onDone: () => void }) {
  const [pending, start] = useTransition(); const toast = useToast();
  return (
    <form className="space-y-3" action={(fd) => start(async () => { const r = await saveCustomer(fd); if ("error" in r) toast(r.error!, "err"); else { toast("Saved"); onDone(); } })}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" hint={c ? "The key we know them by" : ""}><input name="phone" className="num" defaultValue={c?.phone ?? ""} required readOnly={!!c} inputMode="tel" placeholder="98765 43210" /></Field>
        <Field label="Name"><input name="name" defaultValue={c?.name ?? ""} placeholder="Ravi Kumar" /></Field>
      </div>
      <Field label="Email"><input name="email" type="email" defaultValue={c?.email ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Birthday"><input name="birthday" type="date" className="num" defaultValue={c?.birthday ?? ""} /></Field>
        <Field label="Anniversary"><input name="anniversary" type="date" className="num" defaultValue={c?.anniversary ?? ""} /></Field>
      </div>
      <Field label="Tags" hint="comma-separated: vip, jain, corporate"><input name="tags" defaultValue={c?.tags.join(", ") ?? ""} /></Field>
      <Field label="Notes" hint="what the floor should know"><textarea name="notes" rows={2} defaultValue={c?.notes ?? ""} placeholder="Prefers the window table. No onion." /></Field>
      <Button className="w-full" disabled={pending}>Save</Button>
    </form>
  );
}

function CustomerSheet({ c, loyalty, restaurant, onDone }: { c: Customer; loyalty: Loyalty; restaurant: string; onDone: () => void }) {
  const [tab, setTab] = useState<"details" | "history" | "points">("details");
  const [hist, setHist] = useState<{ bills: HistoryRow[]; ledger: { points: number; kind: string; note: string | null; created_at: string }[] } | null>(null);
  const [pts, setPts] = useState(""); const [why, setWhy] = useState(""); const [bal, setBal] = useState(Number(c.points));
  const [pending, start] = useTransition(); const toast = useToast();
  const load = () => { if (!hist) customerHistory(c.id).then((r) => { if ("error" in r) toast(r.error!, "err"); else setHist({ bills: r.bills, ledger: r.ledger }); }); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="num font-semibold">{c.visits} visit{c.visits === 1 ? "" : "s"}</span><span className="text-steel">·</span>
        <span className="num">{formatINR(Number(c.total_spend))} spent</span><span className="text-steel">·</span>
        <span className={cn("num", bal >= loyalty.minRedeem ? "text-mint font-semibold" : "")}>{Math.round(bal)} points{loyalty.enabled ? ` · ${formatINR(bal * loyalty.pointValue)}` : ""}</span>
        <a href={waLink(c.phone, `Hi ${first(c.name)}, ${restaurant} here.`)} target="_blank" rel="noreferrer" className="btn btn-outline !h-8 !text-xs ml-auto"><MessageCircle size={13} /> WhatsApp</a>
      </div>
      <div className="flex gap-1 p-1 bg-porcelain rounded-xl">
        {(["details", "history", "points"] as const).map((t) => <button key={t} onClick={() => { setTab(t); if (t !== "details") load(); }} className={cn("flex-1 h-9 rounded-lg text-xs font-semibold capitalize", tab === t ? "bg-card shadow-feather" : "text-steel")}>{t}</button>)}
      </div>
      {tab === "details" && <CustomerForm c={c} onDone={onDone} />}
      {tab === "history" && (!hist ? <div className="shimmer h-24" /> : hist.bills.length === 0 ? <p className="text-sm text-steel">No paid bills yet.</p> : (
        <div className="divide-y divide-line rounded-xl border border-line">
          {hist.bills.map((b) => (
            <Link key={b.id} href={`/billing/${b.id}?bill=1`} className="block px-3 py-2.5 text-sm hover:bg-porcelain">
              <div className="flex items-center gap-2"><span className="num text-steel">#{b.bill_no}</span><span className="text-xs text-steel">{b.paid_at ? fmtDate(b.paid_at) : ""}{b.coupon_code ? ` · ${b.coupon_code}` : ""}</span>
                {Number(b.points_earned) > 0 && <span className="text-[11px] text-mint">+{Math.round(Number(b.points_earned))} pts</span>}{Number(b.points_redeemed) > 0 && <span className="text-[11px] text-saffron">−{Math.round(Number(b.points_redeemed))} pts</span>}
                <span className="ml-auto num font-semibold">{formatINR(Number(b.total))}</span></div>
              <div className="text-xs text-steel truncate mt-0.5">{(b.orders?.order_items ?? []).filter((i) => i.status !== "cancelled").map((i) => `${i.qty}× ${i.name_snapshot}`).join(", ")}</div>
            </Link>
          ))}
        </div>
      ))}
      {tab === "points" && (
        <div className="space-y-4">
          {!loyalty.enabled && <p className="text-xs text-steel rounded-xl bg-[var(--color-fill)] p-3">Loyalty is switched off for this property, so nothing is earned on bills. Points given here still count once it is on — Settings → Payments.</p>}
          <div className="rounded-xl bg-[var(--color-fill)] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2 flex items-center gap-1.5"><Gift size={13} /> Give or take points</div>
            <div className="grid grid-cols-[110px_1fr_auto] gap-2 items-end">
              <Field label="Points" hint="− to take back"><input type="number" className="num" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="100" /></Field>
              <Field label="Why"><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Birthday gift · complaint · correction" /></Field>
              <Button disabled={pending || !Number(pts)} onClick={() => start(async () => { const r = await adjustPoints(c.id, Number(pts), why); if ("error" in r) toast(r.error!, "err"); else { setBal(r.balance); setPts(""); setWhy(""); setHist(null); load(); toast(`Balance ${Math.round(r.balance)} points`); } })}><Coins size={14} /> Apply</Button>
            </div>
          </div>
          {!hist ? <div className="shimmer h-16" /> : hist.ledger.length === 0 ? <p className="text-sm text-steel">No point movements yet.</p> : (
            <div className="divide-y divide-line rounded-xl border border-line text-sm">
              {hist.ledger.map((l, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2"><span className={cn("num w-16 font-semibold", Number(l.points) < 0 ? "text-chili" : "text-mint")}>{Number(l.points) > 0 ? "+" : ""}{Math.round(Number(l.points))}</span><span className="flex-1 truncate">{l.note ?? l.kind}</span><span className="text-xs text-steel">{fmtDate(l.created_at)}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
