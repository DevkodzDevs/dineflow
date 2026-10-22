"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { csvCell } from "@/lib/csv";
import { motion } from "framer-motion";
import { Plus, Search, MessageCircle, Download, Gift, Coins, Cake, Heart, Users, Sparkles, Moon, Star, Phone, Info, Check, Minus } from "lucide-react";
import { Button, Card, Field, Sheet, Empty, StatTile, cn, useToast } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import { formatINR, fmtDate } from "@/lib/format";
import { saveCustomer, adjustPoints, customerHistory, type HistoryRow } from "./actions";
import { MarketingIdeas } from "./MarketingIdeas";
import { FeedbackBoard, type Feedback } from "./FeedbackBoard";

export type Overview = { total?: number; new_30d?: number; returning?: number; lapsed_60d?: number; points_out?: number; spend_30d?: number; soon?: { id: string; name: string | null; phone: string; what: string; on: string }[] };
type Customer = { id: string; phone: string; name: string | null; email: string | null; birthday: string | null; anniversary: string | null; tags: string[]; notes: string | null; visits: number; total_spend: number; points: number; first_visit_at: string; last_visit_at: string | null };
type Loyalty = { enabled: boolean; earnPct: number; pointValue: number; minRedeem: number };

/** A WhatsApp link to a guest with a message already typed. No API, no cost: it opens the app on this phone. */
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.length === 10 ? "91" + phone : phone}?text=${encodeURIComponent(text)}`;
const first = (n: string | null) => (n ?? "").trim().split(/\s+/)[0] || "there";
/** a guest's initial sits on one of the board's hues, picked by their name so it never changes */
const HUES = ["--color-green", "--color-blue", "--color-orange", "--color-violet", "--color-red"];
const since = (iso: string | null) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null);

export function CustomersClient({ overview: ov, customers, loyalty, restaurant, feedback = [], initialTab = "all" }: { overview: Overview; customers: Customer[]; loyalty: Loyalty; restaurant: string; feedback?: Feedback[]; initialTab?: "all" | "feedback" }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "regulars" | "lapsed" | "new" | "points" | "feedback">(initialTab);
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
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const [more, setMore] = useState(60);
  const counts = useMemo(() => ({
    all: customers.length, regulars: customers.filter((c) => c.visits >= 3).length, new: customers.filter((c) => since(c.first_visit_at)! <= 30).length,
    lapsed: customers.filter((c) => { const d = since(c.last_visit_at); return c.visits >= 2 && d !== null && d >= 60; }).length, points: customers.filter((c) => Number(c.points) >= loyalty.minRedeem).length,
    feedback: feedback.filter((f) => f.status === "new").length,
  }), [customers, loyalty.minRedeem, feedback]);
  const FILTERS = ([["all", "All", Users], ["regulars", "Regulars", Heart], ["new", "New", Sparkles], ["lapsed", "Not seen", Moon], ["points", "Can redeem", Coins], ["feedback", "Feedback", Star]] as const).filter(([k]) => k !== "points" || loyalty.enabled);

  return (
    <div className="space-y-5">
      <SvcHead icon="customers" title="Customers" sub="Your regulars — call or WhatsApp in one tap"
        actions={<button type="button" className="svc-btn go sm !px-5" onClick={() => setAdding(true)} data-add-customer><Plus size={19} aria-hidden /><Say w="add_customer" /></button>} />

      {(ov.soon?.length ?? 0) > 0 && (
        <Card>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-steel mb-2"><Cake size={13} /> Occasions in the next two weeks</div>
          <div className="flex flex-wrap gap-2">
            {ov.soon!.map((s, i) => (
              <a key={i} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-3 min-h-11 text-sm flex items-center gap-2 hover:bg-[var(--color-fill)]"
                href={waLink(s.phone, `Hi ${first(s.name)}! Everyone at ${restaurant} wishes you a very happy ${s.what}${s.what === "birthday" ? " 🎂" : " 💐"}. Come and celebrate with us — dessert is on the house.`)}>
                <span className="font-medium">{s.name ?? s.phone}</span><span className="text-steel">· {s.what} · {s.on}</span><MessageCircle size={13} className="text-mint" />
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* the search, wide, and who to show — with how many in each */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative lg:flex-1 min-w-0 xl:min-w-[240px]"><Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
          <input className="!h-14 !rounded-[18px] !pl-12 !text-[16px]" placeholder={filter === "feedback" ? "Search feedback" : "Name or phone"} aria-label={filter === "feedback" ? "Search the feedback" : "Find a customer by name or phone"} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="rail-fade flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 xl:shrink-0 xl:![mask-image:none] [scrollbar-width:none]" role="group" aria-label="Show">
          {FILTERS.map(([k, label, I]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn("shrink-0 !min-h-12 rounded-full pl-3.5 pr-2 inline-flex items-center gap-2 text-[14px] font-extrabold transition-colors", filter === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
              <I size={16} aria-hidden />{label}<b className={cn("num min-w-6 h-6 px-1.5 rounded-full grid place-items-center text-[12.5px]", filter === k ? "bg-[color-mix(in_srgb,var(--color-on-label)_16%,transparent)]" : "bg-[var(--color-fill-2)]")}>{counts[k]}</b>
            </button>
          ))}
          {filter !== "feedback" && <button type="button" onClick={exportCsv} disabled={!list.length} title="Download what is listed as a CSV" className="shrink-0 !min-h-12 rounded-full px-3.5 inline-flex items-center gap-1.5 text-[13px] font-bold text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]"><Download size={15} /> CSV</button>}
        </div>
      </div>

      {/* guests' private ratings from the feedback QR (0103) — chosen like a filter, shown in place of the cards */}
      {filter === "feedback" ? <FeedbackBoard items={feedback} q={q} restaurant={restaurant} /> : <>
      {customers.length === 0 ? (
        <Empty title="No customers yet" hint="A phone number on an order or bill adds them here." action={<Button onClick={() => setAdding(true)}>Add one by hand</Button>} />
      ) : list.length === 0 ? <Empty title="Nobody matches" hint="Try another name, or clear the filter." /> : (<>
        {/* One card per guest: a coloured initial, the name (Regular when they have come three times) and
            the phone; visits, spend and the last visit in three boxes; Call and WhatsApp, big. A tap on the
            name opens their record: details, bills, points. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[100rem]:grid-cols-4" data-customers>
          {list.slice(0, more).map((c, i) => {
            const d = since(c.last_visit_at); const ago = d === null ? "—" : d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : d < 30 ? `${Math.round(d / 7)} wk${Math.round(d / 7) === 1 ? "" : "s"} ago` : d < 365 ? `${Math.round(d / 30)} mth${Math.round(d / 30) === 1 ? "" : "s"} ago` : `${Math.round(d / 365)} yr ago`;
            const hue = HUES[(c.name ?? c.phone).charCodeAt(0) % HUES.length];
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.015 }} className="feather !rounded-[22px] p-4 flex flex-col gap-3 min-w-0" data-customer={c.id}>
                <button type="button" onClick={() => setOpen(c)} className="!min-h-0 flex items-center gap-3 min-w-0 text-left" data-open-customer aria-label={`Open ${c.name ?? c.phone}`}>
                  <span className="h-14 w-14 shrink-0 rounded-full grid place-items-center font-display text-[26px] text-[var(--color-bezel)]" style={{ background: `var(${hue})` }} aria-hidden>{(c.name ?? "#").trim().slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0"><span className="font-extrabold text-[17px] truncate">{c.name ?? "No name"}</span>{c.visits >= 3 && <span className="svc-chip lone st-cook !min-h-6 !text-[11.5px] !px-2 !gap-1 shrink-0"><Star size={11} aria-hidden /> Regular</span>}</span>
                    <span className="block num text-[14px] text-steel mt-0.5">{c.phone.length === 10 ? `${c.phone.slice(0, 5)} ${c.phone.slice(5)}` : c.phone}</span>
                    {c.tags.length > 0 && <span className="flex flex-wrap gap-1 mt-1">{c.tags.map((t) => <span key={t} className="text-[10.5px] rounded-full bg-[var(--color-fill)] px-2 py-0.5 text-steel">{t}</span>)}</span>}
                  </span>
                </button>
                <div className="grid grid-cols-3 gap-2">
                  {[["Visits", String(c.visits), ""], ["Spent", formatINR(Number(c.total_spend), { whole: true }), ""], ["Last", ago, d !== null && d >= 60 ? "text-chili" : ""]].map(([k, v, cls]) => (
                    <div key={k} className="rounded-[14px] bg-[var(--color-fill)] px-2.5 py-2 min-w-0"><div className="text-[11.5px] font-bold text-steel">{k}</div><div className={cn("font-display num text-[18px] leading-tight truncate", cls)}>{v}</div></div>
                  ))}
                </div>
                {loyalty.enabled && Number(c.points) > 0 && <div className={cn("-mt-1 text-[12.5px] num", Number(c.points) >= loyalty.minRedeem ? "font-bold text-mint" : "text-steel")}><Coins size={12} className="inline -mt-0.5 mr-1" />{Math.round(Number(c.points))} points{Number(c.points) >= loyalty.minRedeem ? " · can redeem" : ""}</div>}
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <a href={`tel:${c.phone}`} className="svc-btn quiet sm" aria-label={`Call ${c.name ?? c.phone}`}><Phone size={17} aria-hidden /><Say w="call" /></a>
                  <a href={waLink(c.phone, `Hi ${first(c.name)}, ${restaurant} here.`)} target="_blank" rel="noreferrer" className="svc-btn go sm" aria-label={`WhatsApp ${c.name ?? c.phone}`}><MessageCircle size={17} aria-hidden /> WhatsApp</a>
                </div>
              </motion.div>
            );
          })}
        </div>
        {list.length > more && <button type="button" className="svc-btn quiet sm w-full" onClick={() => setMore((m) => m + 60)}>Show {Math.min(60, list.length - more)} more · {list.length - more} left</button>}
      </>)}

      {/* the owner's view: how many, who came back, what they spent; and ideas from the sales */}
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3 pt-2" data-customer-stats>
        <StatTile label="Customers" value={String(ov.total ?? customers.length)} sub={`${ov.new_30d ?? 0} new in 30 days`} />
        <StatTile label="Came back" value={String(ov.returning ?? 0)} sub={`${ov.lapsed_60d ?? 0} not seen in 60 days`} tone={(ov.lapsed_60d ?? 0) > 0 ? "alert" : "good"} delay={0.05} />
        <StatTile label="Spent · 30 days" value={formatINR(Number(ov.spend_30d ?? 0))} sub="by known guests" delay={0.1} />
        <StatTile label="Points outstanding" value={String(Math.round(Number(ov.points_out ?? 0)))} sub={loyalty.enabled ? `worth ${formatINR(Number(ov.points_out ?? 0) * loyalty.pointValue)}` : "loyalty is off · Settings → Payments"} delay={0.15} />
      </div>
      <MarketingIdeas customers={customers} minRedeem={loyalty.enabled ? loyalty.minRedeem : Infinity} />
      </>}

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
  const [mode, setMode] = useState<"give" | "take">("give");   // the sign, so nobody has to type a minus (2026-10-20)
  const [pending, start] = useTransition(); const toast = useToast();
  const fetchHist = () => customerHistory(c.id).then((r) => { if ("error" in r) toast(r.error!, "err"); else setHist({ bills: r.bills, ledger: r.ledger }); });
  const load = () => { if (!hist) fetchHist(); };
  const amount = Math.abs(Math.round(Number(pts) || 0)); const signed = mode === "take" ? -amount : amount; const after = Math.round(bal) + signed;
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
          {!loyalty.enabled && (
            <div className="flex items-start gap-3 rounded-2xl bg-[var(--color-fill)] px-3.5 py-3" data-loyalty-off>
              <span className="h-7 w-7 shrink-0 rounded-full grid place-items-center bg-[var(--color-blue-2)] text-[var(--color-blue)]"><Info size={15} aria-hidden /></span>
              <p className="min-w-0 text-[12.5px] leading-snug text-steel pt-1">Loyalty is off, so bills earn no points. Turn it on in Settings → Payments.</p>
            </div>)}
          {/* give or take: the sign is a choice, the amount a plain number with quick picks, the reason full width, and
              the balance it leaves shown before Apply */}
          <section className="rounded-2xl border border-[var(--color-separator)] bg-[var(--color-fill)] p-4 space-y-3" data-points-form>
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-orange-2)] text-[var(--color-orange)]"><Gift size={18} aria-hidden /></span>
              <div className="min-w-0 flex-1"><div className="text-[15px] font-bold leading-tight">Give or take points</div>
                <div className="text-[12.5px] text-steel">A gift, or to fix a mistake</div></div>
              <span className="shrink-0 num text-[12.5px] font-bold px-2.5 h-7 rounded-full grid place-items-center bg-[var(--color-bg-2)] ring-1 ring-[var(--color-separator)]" title="Their balance now">{Math.round(bal)} pts</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
              <div role="group" aria-label="Give or take" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--color-bg-2)] ring-1 ring-[var(--color-separator)]" data-points-mode={mode}>
                {(["give", "take"] as const).map((m) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-points-mode-pick={m}
                    className={cn("!min-h-11 rounded-lg inline-flex items-center justify-center gap-1.5 text-[14px] font-bold transition-colors",
                      mode === m ? (m === "give" ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]") : "text-steel hover:text-[var(--color-label)]")}>
                    {m === "give" ? <Plus size={16} aria-hidden /> : <Minus size={16} aria-hidden />}{m === "give" ? "Give" : "Take back"}
                  </button>))}
              </div>
              <label className="relative block min-w-0">
                <span className="sr-only">Points</span>
                <input type="text" inputMode="numeric" className="num !pr-14" value={pts} onChange={(e) => setPts(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="100" data-points-amount />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-steel" aria-hidden>pts</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
              {[50, 100, 200, 500].map((n) => (
                <button key={n} type="button" aria-pressed={amount === n} onClick={() => setPts(String(n))} data-points-quick={n}
                  className={cn("chip num !min-h-11 min-w-16 justify-center", amount === n && "on")}>{mode === "take" ? "−" : "+"}{n}</button>))}
            </div>
            <label className="block"><span className="text-[13px] font-semibold text-steel">Why</span>
              <input className="mt-1" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={120} placeholder="Birthday gift · complaint · correction" data-points-why /></label>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3 pt-1">
              <p className="min-w-0 flex-1 text-[13px] text-steel" data-points-after>
                {amount ? <>Balance after: <b className={cn("num", after < 0 ? "text-chili" : "text-[var(--color-label)]")}>{after} points</b></> : "Pick give or take, then how many."}
              </p>
              <button type="button" disabled={pending || !amount} data-points-apply
                className={cn("svc-btn sm w-full sm:w-auto !px-6", mode === "give" ? "go" : "no")}
                onClick={() => start(async () => { const r = await adjustPoints(c.id, signed, why); if ("error" in r) toast(r.error!, "err"); else { setBal(r.balance); setPts(""); setWhy(""); fetchHist(); toast(`Balance ${Math.round(r.balance)} points`); } })}>
                <Check size={17} aria-hidden />{mode === "give" ? `Give ${amount || ""} points` : `Take back ${amount || ""} points`}
              </button>
            </div>
          </section>
          {!hist ? <div className="shimmer h-16" /> : hist.ledger.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-2 rounded-2xl border border-dashed border-[var(--color-separator)] px-4 py-6" data-points-empty>
              <span className="h-10 w-10 rounded-full grid place-items-center bg-[var(--color-fill)] text-steel"><Coins size={18} aria-hidden /></span>
              <p className="text-[14px] font-semibold">No point movements yet.</p>
              <p className="text-[12.5px] text-steel max-w-[34ch]">Points earned, spent or given show here.</p>
            </div>) : (
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
