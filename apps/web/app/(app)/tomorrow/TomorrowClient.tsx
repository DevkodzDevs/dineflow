"use client";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Sun, ChefHat, ShoppingBasket, Printer, Share2, Check, TrendingUp, Info, ChevronLeft, ChevronRight, Sparkles, Target } from "lucide-react";
import { Button, Card, StatTile, Segmented, Empty, cn } from "@/components/ui";
import { PageHeader } from "@/components/shell/PageHeader";
import { formatINR } from "@/lib/format";
import { usePrinters } from "@/lib/print/usePrinter";
import { Escpos } from "@/lib/print/escpos";
import { sendToPrinter } from "@/lib/print/transport";
import { saveForecast, buyList, saveChefNotes } from "./actions";
import { copyText, shareText } from "@/lib/clipboard";

type Dish = { id: string; name: string; qty: number };
type Buy = { id: string; name: string; unit: string; need: number; have: number; buy: number; cost: number; why?: "tomorrow" | "reorder"; reorder?: number };
type F = { area_factor?: number; neighbourhood?: { available: boolean; peers?: number; index?: number; label?: string; detail?: string }; for_date: string; weekday: string; predicted_covers: number; low: number; high: number; confidence: number; basis: string; samples: number; in_house: number; arrivals: number; departures: number; rooms: number; drivers: { label: string; detail: string }[]; dishes: Dish[]; purchase: Buy[]; est_purchase_cost: number; buffer_pct: number };
type Score = { days: number; accuracy: number | null; within_range: number | null; recent: { date: string; predicted: number; actual: number }[] };
/* the owner's words for the day, each a multiple of what the numbers expect; "custom" is the
   slider somewhere between them, and lights no segment */
const MOODS = [{ key: "quiet", label: "Quiet", f: 0.7 }, { key: "normal", label: "Normal", f: 1 }, { key: "busy", label: "Busy", f: 1.25 }, { key: "festival", label: "Festival", f: 1.6 }] as const;
type Mood = (typeof MOODS)[number]["key"] | "custom";

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
  /* The list is rescaled here as the owner moves the covers, by the same rule the database used
     (forecast_day, 0092): what tomorrow needs beyond the shelf, and where the shelf after tomorrow
     would sit at or under the reorder level, enough to reach twice the level. Computing only
     need − have here dropped every reorder line — need 0, shelf 200, nothing "to buy". */
  const purchase = useMemo(() => forecast.purchase.map((p) => {
    const need = Math.round(p.need * scale * 100) / 100;
    const level = Number(p.reorder ?? 0);
    const low = level > 0 && p.have - need <= level;
    const buy = Math.max(0, Math.round(Math.max(need - p.have, low ? need + level * 2 - p.have : 0) * 100) / 100);
    const why = need > p.have ? "tomorrow" as const : "reorder" as const;
    return { ...p, need, buy, why, cost: Math.round(buy * (p.buy > 0 ? p.cost / p.buy : 0) * 100) / 100 };
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
    const shared = await shareText({ title: "Tomorrow brief", text });
    if (shared !== "unavailable") return; // shared, or the sheet was closed
    setMsg(await copyText(text) ? "Brief copied — paste it into your WhatsApp group" : "Couldn't copy — select the brief and copy it");
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
  // the slider's reach, the mood the count matches, and how far along the track it stands
  const sMin = Math.max(1, Math.round(forecast.low * 0.5)), sMax = Math.max(10, Math.round(forecast.high * 1.8));
  const mood: Mood = MOODS.find((m) => covers === Math.round(forecast.predicted_covers * m.f))?.key ?? "custom";
  const pct = Math.max(0, Math.min(100, Math.round(((covers - sMin) / Math.max(1, sMax - sMin)) * 100)));
  const move = (days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return `/tomorrow?date=${d.toISOString().slice(0, 10)}`; };

  return (
    <>
      <PageHeader eyebrow="Before you lock up tonight" title="Tomorrow" accent={forecast.weekday}
        sub={nice}
        actions={<div className="flex flex-wrap gap-2 no-print w-full sm:w-auto [&>*:last-child]:basis-full sm:[&>*:last-child]:basis-auto">
          <Link href={move(-1)}><Button variant="outline" size="md" aria-label="Previous day"><ChevronLeft size={16} /></Button></Link>
          <Link href={move(1)}><Button variant="outline" size="md" aria-label="Next day"><ChevronRight size={16} /></Button></Link>
          <Button variant="outline" onClick={printSheet}><Printer size={16} /> Prep sheet</Button>
          <Button onClick={share}><Share2 size={16} /> Send to the team</Button>
        </div>} />

      {msg && <div className="feather p-3 mb-4 text-sm flex items-center gap-2 border-mint"><Check size={15} className="text-mint" /> {msg}</div>}
      {err && <p className="text-sm text-chili mb-4">{err}</p>}

      {/* ── the number, and why ── */}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_minmax(0,1fr)] mb-5">
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
          {/* the owner knows things the data doesn't — let them say so. The four moods are one
              control, each showing the covers it means; the slider is for anything in between,
              its track filled to where it stands. The big number above is the readout, so this
              block carries none of its own. It was a bare 6px range and four 32px chips with a
              different gap above each. */}
          <div className="mt-5 pt-4 border-t border-line no-print" data-adjust>
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="text-xs font-semibold text-steel leading-snug">Know something the numbers don&apos;t? Adjust — the prep and the buy list follow.</span>
              {covers !== forecast.predicted_covers && <button type="button" onClick={() => setCovers(forecast.predicted_covers)} data-reset
                className="shrink-0 text-xs font-semibold text-[var(--color-tint)] !min-h-0 h-9 -my-2.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:-my-3.5 px-2 rounded-lg hover:bg-[var(--color-fill)] inline-flex items-center">Reset to {forecast.predicted_covers}</button>}
            </div>
            <Segmented value={mood} onChange={(m) => { const f = MOODS.find((x) => x.key === m)?.f; if (f) setCovers(Math.round(forecast.predicted_covers * f)); }}
              options={MOODS.map((m) => ({ value: m.key as Mood, label: <>{m.label} <span className="num text-[11px] opacity-60">{Math.round(forecast.predicted_covers * m.f)}</span></> }))}
              className="w-full [&>button]:flex-1 [&>button]:!px-1 [&>button]:!text-[13px]" />
            <div className="mt-2 flex items-center gap-2.5">
              <span className="num text-[11px] text-steel w-5 text-right shrink-0">{sMin}</span>
              <input type="range" min={sMin} max={sMax} value={covers} onChange={(e) => setCovers(Number(e.target.value))} aria-label="Covers to expect"
                className="range flex-1 min-w-0" style={{ "--pct": `${pct}%` } as CSSProperties} data-covers-range />
              <span className="num text-[11px] text-steel w-5 shrink-0">{sMax}</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 content-start">
          {forecast.drivers.map((d, i) => {
            /* a driver arrives as one sentence — "54% · 5 comparable days" — and the first word is
               the figure. Splitting it left the caption starting with the separator, which rendered
               as "· 5 comparable days" on the card. */
            const [head, ...rest] = String(d.detail).split(" ");
            const tail = rest.join(" ").replace(/^[·•\-–—]\s*/, "");
            return <StatTile key={d.label} label={d.label} value={head} sub={tail} delay={i * 0.05} tone={d.label === "Confidence" ? (conf >= 60 ? "good" : undefined) : undefined} />;
          })}
        </div>
      </div>

      {forecast.neighbourhood?.available && (
        <Link href="/neighbours?tab=signal" className="feather feather-lift flex items-center gap-3 p-4 mb-5 border-champagne/60 bg-gradient-to-r from-card to-champagne-2/40">
          <span className="h-9 w-9 rounded-xl bg-ink text-on-label grid place-items-center shrink-0"><TrendingUp size={16} /></span>
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
                  {/* 80px left 48px of room after the base input's 16px side padding, which clipped
                      the word "made" itself; wider box, tighter padding, and centred so it reads */}
                  <input type="number" placeholder="made" value={made[d.id] ?? ""} onChange={(e) => setMade({ ...made, [d.id]: Number(e.target.value) })}
                    aria-label={`Portions actually made of ${d.name}`}
                    className="num !w-24 !py-1.5 !px-2.5 !text-sm text-center shrink-0 no-print" />
                </motion.div>
              ))}
            </div>
          )}
          {dishes.length > 0 && <Button variant="outline" className="mt-4 no-print" disabled={pending} onClick={() => start(async () => { await saveForecast(date, covers); await saveChefNotes(date, made); setMsg("Saved. Tomorrow the brief compares this against what actually sold."); })}><Check size={15} /> Save tonight&apos;s brief</Button>}
        </Card>

        {/* ── market list ── */}
        <Card>
          <div className="flex items-center gap-2 mb-1"><ShoppingBasket size={17} /><h2 className="text-2xl">Buy in the morning</h2></div>
          <p className="text-xs text-steel mb-4">What the pantry is short of after tomorrow&apos;s cooking, and anything that has slipped to its reorder level — topped up to twice the level. Tick what you actually bought and it goes straight into stock.</p>
          {purchase.length === 0 ? (
            <div className="feather p-6 text-center bg-mint-2 border-mint"><Check size={22} className="mx-auto text-ink" /><p className="font-semibold mt-2">Pantry covers tomorrow</p><p className="text-xs text-steel mt-1">Nothing to buy on today&apos;s numbers.</p></div>
          ) : (<>
            <div className="divide-y divide-line">
              {purchase.map((p, i) => (
                <motion.label key={p.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="flex items-center gap-3 py-2.5 cursor-pointer">
         <input type="checkbox" checked={!!picked[p.id]} onChange={(e) => setPicked({ ...picked, [p.id]: e.target.checked })} className="no-print" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate flex items-center gap-2 min-w-0"><span className="truncate">{p.name}</span>
                      {/* why it is here: tomorrow's cooking needs more than the shelf holds, or the shelf has slipped to its reorder level */}
                      {p.why && <span className={cn("shrink-0 inline-flex items-center h-5 px-1.5 rounded-full text-[10.5px] font-semibold", p.why === "reorder" ? "bg-[var(--color-orange)]/15 text-[var(--color-orange)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")} data-why={p.why}>{p.why === "reorder" ? "below reorder level" : "for tomorrow"}</span>}
                    </div>
                    <div className="text-xs text-steel num">need {p.need} · have {p.have} {p.unit}{p.why === "reorder" && p.reorder ? ` · reorder at ${p.reorder}` : ""}</div>
                  </div>
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
