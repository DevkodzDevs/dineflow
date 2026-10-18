"use client";
/* eslint-disable @next/next/no-img-element -- logos and dish photos are the property's own uploads on any host; a plain img keeps these pages free of next/image remote patterns */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Minus, ShoppingBag, X, ArrowLeft, UtensilsCrossed, Check, Loader2, Hand } from "lucide-react";
import { clsx } from "clsx";
import { defaultVariant, linePrice, lineKey, lineName, optionProblem, tilePrice, hasOptions, type Optioned, type Variant, type Addon } from "@dineflow/shared";
import { formatINR } from "@/lib/format";
import { kioskOrder, kioskLeave } from "./actions";

type Item = Optioned & { is_veg: boolean | null; category_id: string | null; image_url: string | null; description: string | null };
type Line = { key: string; item: Item; variant: Variant | null; addons: Addon[]; qty: number };
type Step = "hello" | "menu" | "review" | "done";

const IDLE = 90_000;    // a guest who walked away: the next one starts clean
const DONE = 25_000;    // the token stays up long enough to read and photograph

function Veg({ v }: { v: boolean | null }) {
  if (v == null) return null;
  const c = v ? "var(--color-green)" : "var(--color-red)";
  return <span aria-label={v ? "Veg" : "Non-veg"} className="inline-grid place-items-center shrink-0 h-4 w-4 rounded-[3px] border-2" style={{ borderColor: c }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} /></span>;
}

/**
 * The kiosk: Tap to order → dishes by category, big photos → a size or extras asked for when the dish has them →
 * the basket → Place order → the token, "Pay at the counter". It goes back to the start by itself after a minute
 * and a half untouched, or 25 seconds after the token. Holding the top-left corner for two seconds leaves the kiosk.
 */
export function KioskClient({ name, logo, categories, items }: { name: string; logo: string | null; categories: { id: string; name: string }[]; items: Item[] }) {
  const [step, setStep] = useState<Step>("hello");
  const cats = useMemo(() => categories.filter((c) => items.some((i) => i.category_id === c.id)), [categories, items]);
  const [cat, setCat] = useState<string | null>(cats[0]?.id ?? null);
  const [lines, setLines] = useState<Line[]>([]);
  const [ask, setAsk] = useState<Item | null>(null);
  const [guest, setGuest] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ token: number | null; orderNo: number | null; total: number } | null>(null);
  const [pending, start] = useTransition();

  const reset = () => { setStep("hello"); setLines([]); setAsk(null); setGuest(""); setErr(null); setDone(null); setCat(cats[0]?.id ?? null); };
  // idle → back to the start; any touch counts as activity
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => { last.current = Date.now(); };
    window.addEventListener("pointerdown", bump); window.addEventListener("keydown", bump);
    const t = setInterval(() => { if (step !== "hello" && Date.now() - last.current > (step === "done" ? DONE : IDLE)) reset(); }, 3000);
    return () => { window.removeEventListener("pointerdown", bump); window.removeEventListener("keydown", bump); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // the staff's way out: hold the top-left corner for two seconds
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the gesture only opens the question; the tablet's sign-in password lets staff out (kioskLeave)
  const [leaving, setLeaving] = useState(false); const [pw, setPw] = useState(""); const [leaveErr, setLeaveErr] = useState<string | null>(null);
  const exitDown = () => { hold.current = setTimeout(() => { setLeaving(true); setPw(""); setLeaveErr(null); }, 2000); };
  const exitUp = () => { if (hold.current) clearTimeout(hold.current); };

  const put = (item: Item, variant: Variant | null, addons: Addon[], d: number) => setLines((ls) => {
    const key = lineKey(item.id, variant?.id, addons.map((a) => a.id)); const at = ls.findIndex((l) => l.key === key);
    if (at < 0) return d > 0 ? [...ls, { key, item, variant, addons, qty: d }] : ls;
    return ls.map((l, i) => (i === at ? { ...l, qty: Math.min(99, l.qty + d) } : l)).filter((l) => l.qty > 0);
  });
  const tap = (it: Item) => (hasOptions(it) ? setAsk(it) : put(it, null, [], 1));
  const qtyOf = (id: string) => lines.filter((l) => l.item.id === id).reduce((a, l) => a + l.qty, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const total = lines.reduce((a, l) => a + l.qty * linePrice(l.item, l.variant, l.addons), 0);

  const place = () => start(async () => {
    setErr(null);
    let r: Awaited<ReturnType<typeof kioskOrder>>;
    try { r = await kioskOrder({ name: guest, items: lines.map((l) => ({ menu_item_id: l.item.id, qty: l.qty, variant_id: l.variant?.id ?? null, addon_ids: l.addons.map((a) => a.id) })) }); }
    catch {
      // after an update the old page cannot reach the new server: reload when the server is there (the basket goes)
      setErr("The kiosk is updating — one moment, then please choose again.");
      void fetch(location.href, { method: "HEAD", cache: "no-store" }).then((x) => { if (x.ok) setTimeout(() => location.reload(), 1500); }).catch(() => {});
      return;
    }
    if ("error" in r) { setErr(r.error ?? "Could not place the order — please ask at the counter."); return; }
    setDone({ token: r.token ?? null, orderNo: r.orderNo ?? null, total }); setStep("done"); last.current = Date.now();
  });

  const shown = items.filter((i) => i.category_id === cat);

  return (
    <div className="h-full flex flex-col relative" data-kiosk={step}>
      <div className="absolute left-0 top-0 h-16 w-16 z-50" onPointerDown={exitDown} onPointerUp={exitUp} onPointerLeave={exitUp} aria-hidden data-kiosk-exit />

      {step === "hello" && (
        <button type="button" onClick={() => { setStep("menu"); last.current = Date.now(); }} className="flex-1 !min-h-0 flex flex-col items-center justify-center gap-6 p-8 text-center" data-kiosk-start>
          {logo ? <img src={logo} alt="" className="h-28 w-28 rounded-[28px] object-cover shadow-[var(--shadow-pop)]" /> : <div className="h-28 w-28 rounded-[28px] grid place-items-center bg-[var(--color-fill)] text-5xl font-black">{name.slice(0, 1)}</div>}
          <div className="text-[clamp(32px,5vw,64px)] font-black tracking-tight leading-tight">{name}</div>
          <div className="text-[clamp(18px,2.2vw,28px)] text-[var(--color-label-2)]">Order here and skip the queue</div>
          <span className="mt-4 inline-flex items-center gap-3 rounded-full px-10 py-5 text-[clamp(20px,2.4vw,30px)] font-extrabold" style={{ background: "var(--color-tint)", color: "var(--color-on-tint)" }}><Hand size={30} aria-hidden /> Tap to start</span>
        </button>
      )}

      {(step === "menu" || step === "review") && <>
        <header className="shrink-0 flex items-center gap-3 px-5 pt-4 pb-3 border-b border-[var(--color-separator)]">
          {step === "review"
            ? <button type="button" onClick={() => setStep("menu")} className="!min-h-12 rounded-full pl-3 pr-5 inline-flex items-center gap-2 text-[16px] font-bold bg-[var(--color-fill)]"><ArrowLeft size={20} aria-hidden /> Add more</button>
            : <div className="min-w-0 flex-1 text-[22px] font-black truncate pl-14">{name}</div>}
          {step === "review" && <div className="flex-1 text-center text-[22px] font-black">Your order</div>}
          <button type="button" onClick={reset} className="!min-h-12 rounded-full px-5 text-[15px] font-bold text-[var(--color-label-2)] hover:bg-[var(--color-fill)]" data-kiosk-cancel>Start over</button>
        </header>

        {step === "menu" && <>
          <nav className="shrink-0 flex gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none]" aria-label="Categories">
            {cats.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className={clsx("shrink-0 !min-h-14 rounded-full px-6 text-[17px] font-extrabold transition-colors", cat === c.id ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>{c.name}</button>)}
          </nav>
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-32">
            <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))]" data-kiosk-items>
              {shown.map((it) => { const tp = tilePrice(it); const q = qtyOf(it.id); return (
                <button key={it.id} type="button" onClick={() => tap(it)} data-kiosk-item className={clsx("!min-h-0 min-w-0 text-left rounded-[24px] bg-white overflow-hidden flex flex-col shadow-[0_0_0_1px_var(--color-separator)] active:scale-[.98] transition-transform", q > 0 && "!shadow-[0_0_0_3px_var(--color-tint)]")}>
                  <div className="relative aspect-[4/3] bg-[var(--color-fill)] grid place-items-center">
                    {it.image_url ? <img src={it.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <UtensilsCrossed size={40} className="text-[var(--color-label-3)]" aria-hidden />}
                    {q > 0 && <span className="absolute top-2.5 right-2.5 min-w-9 h-9 px-2 rounded-full grid place-items-center text-[16px] font-black" style={{ background: "var(--color-tint)", color: "var(--color-on-tint)" }}>{q}</span>}
                  </div>
                  <div className="p-3.5 flex flex-col gap-1.5 flex-1">
                    <div className="flex items-start gap-2"><span className="pt-1"><Veg v={it.is_veg} /></span><span className="min-w-0 flex-1 text-[17px] font-extrabold leading-tight line-clamp-2">{it.name}</span></div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <span className="text-[18px] font-black tabular-nums">{tp.from && <span className="text-[12px] font-semibold text-[var(--color-label-2)] mr-1">from</span>}{formatINR(tp.price, { whole: true })}</span>
                      <span className="h-10 w-10 rounded-full grid place-items-center" style={{ background: "var(--color-tint)", color: "var(--color-on-tint)" }} aria-hidden><Plus size={22} /></span>
                    </div>
                  </div>
                </button>); })}
            </div>
          </div>
        </>}

        {step === "review" && (
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 pb-40">
            <div className="mx-auto max-w-[720px] space-y-3" data-kiosk-basket>
              {lines.map((l) => (
                <div key={l.key} className="rounded-[20px] bg-white p-4 flex items-center gap-4 shadow-[0_0_0_1px_var(--color-separator)]">
                  <div className="min-w-0 flex-1"><div className="text-[17px] font-extrabold leading-tight">{lineName(l.item, l.variant)}</div>
                    {l.addons.length > 0 && <div className="text-[13.5px] text-[var(--color-label-2)] mt-0.5">{l.addons.map((a) => `+ ${a.name}`).join(" · ")}</div>}
                    <div className="text-[15px] font-bold tabular-nums mt-1">{formatINR(l.qty * linePrice(l.item, l.variant, l.addons))}</div></div>
                  <div className="shrink-0 flex items-center gap-2">
                    <button type="button" aria-label="One less" onClick={() => put(l.item, l.variant, l.addons, -1)} className="h-12 w-12 !min-h-12 rounded-full grid place-items-center bg-[var(--color-fill)]"><Minus size={20} /></button>
                    <span className="w-8 text-center text-[19px] font-black tabular-nums">{l.qty}</span>
                    <button type="button" aria-label="One more" onClick={() => put(l.item, l.variant, l.addons, 1)} className="h-12 w-12 !min-h-12 rounded-full grid place-items-center bg-[var(--color-fill)]"><Plus size={20} /></button>
                  </div>
                </div>))}
              {lines.length === 0 && <p className="text-center text-[17px] text-[var(--color-label-2)] py-10">Your basket is empty.</p>}
              <label className="block pt-2"><span className="text-[14px] font-bold text-[var(--color-label-2)]">Your name (optional — we call it with your token)</span>
                <input value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={40} className="mt-2 w-full !h-14 rounded-2xl px-4 !text-[18px]" placeholder="e.g. Priya" autoComplete="off" data-kiosk-name /></label>
              {err && <p className="text-[15px] font-bold text-[var(--color-red)]" role="alert">{err}</p>}
            </div>
          </div>
        )}

        {count > 0 && (
          <div className="absolute inset-x-0 bottom-0 p-4 pt-8 bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)] to-transparent">
            <button type="button" disabled={pending} onClick={() => (step === "menu" ? setStep("review") : place())} data-kiosk-next
              className="mx-auto w-full max-w-[720px] !min-h-[68px] rounded-[22px] flex items-center gap-4 px-6 text-[20px] font-extrabold shadow-[var(--shadow-pop)] disabled:opacity-70" style={{ background: "var(--color-tint)", color: "var(--color-on-tint)" }}>
              {pending ? <Loader2 size={24} className="animate-spin" aria-hidden /> : <ShoppingBag size={24} aria-hidden />}
              <span className="flex-1 text-left">{step === "menu" ? `View order · ${count} item${count === 1 ? "" : "s"}` : "Place order"}</span>
              <span className="tabular-nums">{formatINR(total)}</span>
            </button>
          </div>
        )}
      </>}

      {step === "done" && done && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center" data-kiosk-done>
          <div className="h-20 w-20 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><Check size={44} strokeWidth={3} aria-hidden /></div>
          <div className="text-[24px] font-extrabold">Thank you{guest.trim() ? `, ${guest.trim().split(" ")[0]}` : ""}! Your token</div>
          <div className="text-[clamp(96px,16vw,200px)] font-black leading-none tabular-nums" data-kiosk-token>{done.token ?? done.orderNo ?? "—"}</div>
          <div className="rounded-2xl bg-white px-6 py-4 shadow-[0_0_0_1px_var(--color-separator)]">
            <div className="text-[20px] font-extrabold">Pay {formatINR(done.total)} at the counter</div>
            <div className="text-[14px] text-[var(--color-label-2)] mt-1">Taxes, if any, are added on the bill. Watch the screen for your number.</div>
          </div>
          <button type="button" onClick={reset} className="mt-4 !min-h-14 rounded-full px-8 text-[18px] font-extrabold bg-[var(--color-fill)]">New order</button>
        </div>
      )}

      {ask && <Chooser item={ask} onClose={() => setAsk(null)} onAdd={(v, a) => { put(ask, v, a, 1); setAsk(null); }} />}

      {leaving && (
        <div className="absolute inset-0 z-50 bg-black/55 grid place-items-center p-6" onClick={() => setLeaving(false)}>
          <form role="dialog" aria-modal aria-label="Leave the kiosk" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-[24px] bg-[var(--color-bg)] p-5 space-y-3" data-kiosk-leave
            onSubmit={(e) => { e.preventDefault(); start(async () => { const x = await kioskLeave(pw); if ("error" in x) { setLeaveErr(x.error!); setPw(""); } else location.assign("/orders"); }); }}>
            <div className="text-[19px] font-extrabold">Staff only</div>
            <p className="text-[14px] text-[var(--color-label-2)]">Enter this tablet&apos;s sign-in password to leave the kiosk.</p>
            <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} className="!h-14 !text-[18px]" aria-label="Password" data-kiosk-password />
            {leaveErr && <p className="text-[14px] font-semibold text-[var(--color-red)]" role="alert">{leaveErr}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLeaving(false)} className="!min-h-12 rounded-2xl bg-[var(--color-fill)] font-bold">Stay</button>
              <button type="submit" disabled={pending || !pw} className="!min-h-12 rounded-2xl font-extrabold disabled:opacity-50" style={{ background: "var(--color-tint)", color: "var(--color-on-tint)" }} data-kiosk-leave-go>Leave</button>
            </div>
          </form>
        </div>)}
    </div>
  );
}

/** A dish with sizes or extras asks before it goes in the basket — the till's rules (`optionProblem`), bigger. */
function Chooser({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (v: Variant | null, a: Addon[]) => void }) {
  const [v, setV] = useState<Variant | null>(defaultVariant(item)); const [picked, setPicked] = useState<Addon[]>([]);
  const problem = optionProblem(item, picked);
  const toggle = (g: NonNullable<Item["addon_groups"]>[number], a: Addon) => setPicked((p) => {
    if (p.some((x) => x.id === a.id)) return p.filter((x) => x.id !== a.id);
    const inGroup = p.filter((x) => g.addons.some((y) => y.id === x.id));
    if (g.max === 1) return [...p.filter((x) => !inGroup.includes(x)), a];
    if (g.max > 0 && inGroup.length >= g.max) return p;
    return [...p, a];
  });
  return (
    <div className="absolute inset-0 z-40 bg-black/45 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={item.name} onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-[640px] max-h-[88%] flex flex-col rounded-t-[28px] sm:rounded-[28px] bg-[var(--color-bg)] overflow-hidden" data-kiosk-chooser>
        <div className="flex items-center gap-3 p-5 border-b border-[var(--color-separator)]">
          <div className="min-w-0 flex-1 text-[22px] font-black leading-tight">{item.name}</div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-12 w-12 !min-h-12 rounded-full grid place-items-center bg-[var(--color-fill)]"><X size={22} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
          {(item.variants?.length ?? 0) > 0 && <div>
            <div className="text-[14px] font-bold uppercase tracking-wide text-[var(--color-label-2)] mb-2.5">Size</div>
            <div className="grid grid-cols-2 gap-2.5">{item.variants!.map((x) => (
              <button key={x.id} type="button" aria-pressed={v?.id === x.id} onClick={() => setV(x)} className={clsx("!min-h-16 rounded-2xl px-4 flex items-center justify-between gap-2 text-[17px] font-bold border-2", v?.id === x.id ? "border-[var(--color-tint)] bg-white" : "border-transparent bg-[var(--color-fill)]")}>
                <span className="truncate">{x.name}</span><span className="tabular-nums shrink-0">{formatINR(x.price, { whole: true })}</span></button>))}</div>
          </div>}
          {(item.addon_groups ?? []).map((g) => (
            <div key={g.id}>
              <div className="text-[14px] font-bold uppercase tracking-wide text-[var(--color-label-2)] mb-2.5">{g.name}{g.min > 0 ? " · choose " + g.min : g.max > 0 ? ` · up to ${g.max}` : ""}</div>
              <div className="grid grid-cols-2 gap-2.5">{g.addons.map((a) => { const on = picked.some((x) => x.id === a.id); return (
                <button key={a.id} type="button" aria-pressed={on} onClick={() => toggle(g, a)} className={clsx("!min-h-16 rounded-2xl px-4 flex items-center justify-between gap-2 text-[16px] font-bold border-2", on ? "border-[var(--color-tint)] bg-white" : "border-transparent bg-[var(--color-fill)]")}>
                  <span className="truncate">{a.name}</span><span className="tabular-nums shrink-0 text-[var(--color-label-2)]">{Number(a.price) > 0 ? "+" + formatINR(a.price, { whole: true }) : "free"}</span></button>); })}</div>
            </div>))}
        </div>
        <div className="p-5 border-t border-[var(--color-separator)]">
          {problem && <p className="mb-2 text-[14px] font-semibold text-[var(--color-orange)]">{problem}</p>}
          <button type="button" disabled={!!problem} onClick={() => onAdd(v, picked)} data-kiosk-add className="w-full !min-h-16 rounded-[20px] text-[19px] font-extrabold flex items-center justify-center gap-3 disabled:opacity-50" style={{ background: "var(--color-tint)", color: "var(--color-on-tint)" }}>
            <Plus size={22} aria-hidden /> Add · {formatINR(linePrice(item, v, picked))}</button>
        </div>
      </div>
    </div>
  );
}
