"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sun, ChefHat, ShoppingBasket, Printer, Share2, Check, TrendingUp, Info, ChevronLeft, ChevronRight, Sparkles, Target } from "lucide-react";
import { Button, Card, Pill, StatTile, cn, Empty } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatINR } from "@/lib/format";
import { usePrinters } from "@/lib/print/usePrinter";
import { Escpos } from "@/lib/print/escpos";
import { sendToPrinter } from "@/lib/print/transport";
import { saveForecast, buyList, saveChefNotes } from "./actions";

type Dish = { id: string; name: string; qty: number };
type Buy = { id: string; name: string; unit: string; need: number; have: number; buy: number; cost: number };
type F = { area_factor?: number; neighbourhood?: { available: boolean; peers?: number; index?: number; label?: string; detail?: string }; for_date: string; weekday: string; predicted_covers: number; low: number; high: number; confidence: number; basis: string; samples: number; in_house: number; arrivals: number; departures: number; rooms: number; drivers: { label: string; detail: string }[]; dishes: Dish[]; purchase: Buy[]; est_purchase_cost: number; buffer_pct: number };
type Score = { days: number; accuracy: number | null; within_range: number | null; recent: { date: string; predicted: number; actual: number }[] };

export function TomorrowClient({ date, forecast, score, saved, restaurant }: { date: string; forecast: F; score: Score; saved: { chef_notes: Record<string, number> } | null; restaurant: { name: string; phone: string | null; brief_whatsapp?: string | null } }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [covers, setCovers] = useState(forecast.predicted_covers);
  const [picked, setPicked] = useState<Record<string, boolean>>(Object.fromEntries(forecast.purchase.map((p) => [p.id, true])));
  const [made, setMade] = useState<Record<string, number>>(saved?.chef_notes ?? {});
  const { printers } = usePrinters();

  // Everything scales when the owner overrides the cover count — they know about the wedding down the road.
  const scale = forecast.predicted_covers > 0 ? covers / forecast.predicted_covers : 1;
  const dishes = useMemo(() => forecast.dishes.map((d) => ({ ...d, qty: Math.max(1, Math.round(d.qty * scale)) })), [forecast.dishes, scale]);
  const purchase = useMemo(() => forecast.purchase.map((p) => {
    const need = Math.round(p.need * scale * 100) / 100; const buy = Math.max(0, Math.round((need - p.have) * 100) / 100);
    return { ...p, need, buy, cost: Math.round(buy * (p.buy > 0 ? p.cost / p.buy : 0) * 100) / 100 };
  }).filter((p) => p.buy > 0), [forecast.purchase, scale]);
  const chosen = purchase.filter((p) => picked[p.id]);
  const cost = chosen.reduce((t, p) => t + p.cost, 0);
  const nice = new Date(date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const conf = Math.round(forecast.confidence * 100);

  const whatsappText = () => [
    `*${restaurant.name} — tomorrow, ${nice}*`,
    `Expect about ${covers} covers${forecast.rooms > 0 ? ` · ${forecast.in_house} guests in house, ${forecast.arrivals} arriving, ${forecast.departures} leaving` : ""}`,
    "", "*Prep*", ...dishes.slice(0, 12).map((d) => `• ${d.name} — ${d.qty}`),
    ...(purchase.length ? ["", "*Buy in the morning*", ...purchase.map((p) => `• ${p.name} — ${p.buy} ${p.unit}`), `Approx ${formatINR(purchase.reduce((t, p) => t + p.cost, 0))}`] : []),
  ].join("\n");

  const share = async () => {
    const text = whatsappText();
    const num = (restaurant.brief_whatsapp ?? "").replace(/\D/g, "");
    if (num) { window.open(`https://wa.me/${num.length === 10 ? "91" + num : num}?text=${encodeURIComponent(text)}`, "_blank"); return; }
    if (navigator.share) { await navigator.share({ title: "Tomorrow brief", text }); return; }
    await navigator.clipboard.writeText(text); setMsg("Brief copied — paste it into your WhatsApp group");
  };

  const printSheet = async () => {
    const target = printers.find((p) => (p as { kind?: string }).kind !== "bill") ?? printers[0];
    const w = (target?.width === 58 ? 58 : 80) as 58 | 80;
    const p = new Escpos(w);
    p.align("c").size(2).bold(true).line("PREP SHEET").size(1).bold(false).line(nice).rule("=").align("l");
    p.size(2).bold(true).line(`~${covers} covers`).size(1).bold(false);
    if (forecast.rooms > 0) p.line(`${forecast.in_house} in house · ${forecast.arrivals} in · ${forecast.departures} out`);
    p.rule();
    dishes.forEach((d) => { p.size(2).bold(true).line(`${d.qty}  ${d.name}`.slice(0, p.cols)).size(1).bold(false).line("   made: ______"); });
    if (purchase.length) { p.rule().bold(true).line("BUY").bold(false); purchase.forEach((x) => p.row(x.name, `${x.buy} ${x.unit}`)); }
    p.rule().line("Chef signature: ______________").feed(1).cut();
    if (target) { try { await sendToPrinter({ id: target.id, name: target.name, transport: target.transport, width: target.width, address: target.address }, p.bytes()); setMsg(`Prep sheet sent to ${target.name}`); } catch (e) { setErr((e as Error).message); } }
    else window.print();
  };

  const cold = forecast.samples === 0;
  const move = (days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return `/tomorrow?date=${d.toISOString().slice(0, 10)}`; };

  return (
    <>
      <PageHeader eyebrow="Before you lock up tonight" title="Tomorrow" accent={forecast.weekday}
        sub={nice}
        actions={<div className="flex gap-2 no-print">
          <Link href={move(-1)}><Button variant="outline" size="md" aria-label="Previous day"><ChevronLeft size={16} /></Button></Link>
          <Link href={move(1)}><Button variant="outline" size="md" aria-label="Next day"><ChevronRight size={16} /></Button></Link>
          <Button variant="outline" onClick={printSheet}><Printer size={16} /> Prep sheet</Button>
          <Button onClick={share}><Share2 size={16} /> Send to the team</Button>
        </div>} />

      {msg && <div className="feather p-3 mb-4 text-sm flex items-center gap-2 border-mint"><Check size={15} className="text-mint" /> {msg}</div>}
      {err && <p className="text-sm text-chili mb-4">{err}</p>}

      {/* ── the number, and why ── */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr] mb-5">
        <Card glow className="relative overflow-hidden">
          <div className="flex items-start gap-4">
            <span className="h-12 w-12 rounded-2xl bg-gradient-to-b from-saffron-2 to-saffron text-ink grid place-items-center shrink-0 shadow-[inset_0_1px_0_rgb(255_255_255/.5)]"><Sun size={22} /></span>
            <div className="flex-1 min-w-0">
              <div className="eyebrow">Expect about</div>
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-display num text-[64px] leading-none count-up">{covers}</span>
                <span className="text-steel text-sm">covers · likely {Math.round(forecast.low * scale)}–{Math.round(forecast.high * scale)}</span>
              </div>
              <p className="text-sm text-steel mt-2 leading-relaxed">{forecast.basis}</p>
            </div>
          </div>
          {/* the owner knows things the data doesn't — let them say so */}
          <div className="mt-5 pt-4 border-t border-line no-print">
            <div className="flex items-center justify-between text-xs font-semibold text-steel mb-2">
              <span>Something the numbers don&apos;t know? Adjust and everything below recalculates.</span>
              {covers !== forecast.predicted_covers && <button onClick={() => setCovers(forecast.predicted_covers)} className="underline">reset</button>}
            </div>
            <input type="range" min={Math.max(1, Math.round(forecast.low * 0.5))} max={Math.max(10, Math.round(forecast.high * 1.8))} value={covers} onChange={(e) => setCovers(Number(e.target.value))} className="w-full !p-0 !border-0 !shadow-none accent-[var(--color-saffron)]" />
            <div className="flex gap-2 mt-2 flex-wrap">
              {[["Quiet", 0.7], ["Normal", 1], ["Busy", 1.25], ["Festival", 1.6]].map(([l, f]) => (
                <button key={l as string} onClick={() => setCovers(Math.round(forecast.predicted_covers * (f as number)))} className={cn("chip !h-8 text-xs", covers === Math.round(forecast.predicted_covers * (f as number)) && "on")}>{l as string}</button>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 content-start">
          {forecast.drivers.map((d, i) => <StatTile key={d.label} label={d.label} value={String(d.detail).split(" ")[0]} sub={String(d.detail).split(" ").slice(1).join(" ")} delay={i * 0.05} tone={d.label === "Confidence" ? (conf >= 60 ? "good" : undefined) : undefined} />)}
        </div>
      </div>

      {forecast.neighbourhood?.available && (
        <Link href="/neighbours?tab=signal" className="feather feather-lift flex items-center gap-3 p-4 mb-5 border-champagne/60 bg-gradient-to-r from-card to-champagne-2/40">
          <span className="h-9 w-9 rounded-xl bg-ink text-champagne grid place-items-center shrink-0"><TrendingUp size={16} /></span>
          <div className="flex-1 text-sm"><b>The neighbourhood is {forecast.neighbourhood.label}.</b> <span className="text-steel">{forecast.neighbourhood.detail} This brief has been nudged accordingly.</span></div>
          <span className="text-xs font-semibold text-steel">Area signal →</span>
        </Link>
      )}
      {cold && (
        <Card className="!bg-champagne-2 flex items-start gap-3 mb-5">
          <Info size={18} className="shrink-0 mt-0.5" />
          <div className="text-sm"><b>Still learning.</b> The brief needs about four weeks of trading before it predicts well. Until then it only counts what your bookings guarantee, and it will tell you honestly how sure it is. Nothing here is an instruction — edit anything before you act on it.</div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── prep ── */}
        <Card>
          <div className="flex items-center gap-2 mb-1"><ChefHat size={17} /><h2 className="text-2xl">Prep for the kitchen</h2></div>
          <p className="text-xs text-steel mb-4">Portions include your {forecast.buffer_pct}% buffer. The chef writes back what was actually made — that is what teaches tomorrow&apos;s brief.</p>
          {dishes.length === 0 ? <Empty title="Nothing to prep yet" hint="Once dishes start selling, this fills itself in." /> : (
            <div className="divide-y divide-line">
              {dishes.slice(0, 18).map((d, i) => (
                <motion.div key={d.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }} className="flex items-center gap-3 py-2.5">
                  <span className="num font-display text-2xl w-12 shrink-0">{d.qty}</span>
                  <span className="flex-1 font-medium truncate">{d.name}</span>
                  <input type="number" placeholder="made" value={made[d.id] ?? ""} onChange={(e) => setMade({ ...made, [d.id]: Number(e.target.value) })}
                    className="num !w-20 !py-1.5 !text-sm no-print" />
                </motion.div>
              ))}
            </div>
          )}
          {dishes.length > 0 && <Button variant="outline" className="mt-4 no-print" disabled={pending} onClick={() => start(async () => { await saveForecast(date, covers); await saveChefNotes(date, made); setMsg("Saved. Tomorrow the brief compares this against what actually sold."); })}><Check size={15} /> Save tonight&apos;s brief</Button>}
        </Card>

        {/* ── market list ── */}
        <Card>
          <div className="flex items-center gap-2 mb-1"><ShoppingBasket size={17} /><h2 className="text-2xl">Buy in the morning</h2></div>
          <p className="text-xs text-steel mb-4">What the pantry is short of after tomorrow&apos;s cooking. Tick what you actually bought and it goes straight into stock.</p>
          {purchase.length === 0 ? (
            <div className="feather p-6 text-center bg-mint-2 border-mint"><Check size={22} className="mx-auto text-ink" /><p className="font-semibold mt-2">Pantry covers tomorrow</p><p className="text-xs text-steel mt-1">Nothing to buy on today&apos;s numbers.</p></div>
          ) : (<>
            <div className="divide-y divide-line">
              {purchase.map((p, i) => (
                <motion.label key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={!!picked[p.id]} onChange={(e) => setPicked({ ...picked, [p.id]: e.target.checked })} className="!w-auto no-print" />
                  <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-xs text-steel num">need {p.need} · have {p.have} {p.unit}</div></div>
                  <div className="text-right"><div className="num font-semibold">{p.buy} {p.unit}</div><div className="text-xs text-steel num">{formatINR(p.cost)}</div></div>
                </motion.label>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
              <span className="text-sm text-steel">{chosen.length} item{chosen.length === 1 ? "" : "s"} · approx</span>
              <span className="num text-2xl font-semibold">{formatINR(cost)}</span>
            </div>
            <Button className="w-full mt-3 no-print" disabled={pending || chosen.length === 0} onClick={() => start(async () => { const r = await buyList(date, chosen.map((p) => ({ id: p.id, buy: p.buy }))); if ("error" in r) setErr(r.error!); else setMsg(`${r.count} item(s) added to the pantry`); })}>
              <ShoppingBasket size={16} /> I bought these — add to pantry
            </Button>
          </>)}
        </Card>
      </div>

      {/* ── how honest has this been? ── */}
      <Card className="mt-4">
        <div className="flex items-center gap-2 mb-1"><Target size={17} /><h2 className="text-2xl">Was it right?</h2></div>
        <p className="text-xs text-steel mb-4">Every brief is graded the next day against what actually sold. Judge it before you trust it.</p>
        {!score?.days ? <p className="text-sm text-steel">No graded days yet — save a brief tonight and check back tomorrow evening.</p> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <StatTile label="Average accuracy" value={score.accuracy != null ? `${score.accuracy}%` : "—"} sub={`over ${score.days} graded days`} tone={(score.accuracy ?? 0) >= 80 ? "good" : undefined} />
              <StatTile label="Inside the range" value={score.within_range != null ? `${score.within_range}%` : "—"} sub="fell between low and high" delay={0.05} />
              <StatTile label="Days learned" value={String(score.days)} sub={score.days < 28 ? "improves up to ~4 weeks" : "well trained"} delay={0.1} />
            </div>
            <div className="flex items-end gap-1.5 h-28">
              {score.recent.slice().reverse().map((r) => {
                const max = Math.max(...score.recent.flatMap((x) => [x.predicted, x.actual]), 1);
                return (
                  <div key={r.date} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full flex items-end gap-0.5 h-20">
                      <div className="flex-1 rounded-t bg-line-2" style={{ height: `${(r.predicted / max) * 100}%` }} title={`predicted ${r.predicted}`} />
                      <div className="flex-1 rounded-t bg-saffron" style={{ height: `${(r.actual / max) * 100}%` }} title={`actual ${r.actual}`} />
                    </div>
                    <span className="text-[9px] text-steel num">{r.date.slice(8)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-steel"><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-line-2" /> predicted</span><span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-saffron" /> actual</span></div>
          </>
        )}
      </Card>

      <p className="text-xs text-steel mt-4 flex items-start gap-1.5"><Sparkles size={13} className="mt-0.5 shrink-0" /> This is a suggestion built from your own history and bookings, not a rule. Weather, a wedding hall next door or a bandh will beat any forecast — use the Quiet/Busy buttons when you know something it doesn&apos;t.</p>
    </>
  );
}
