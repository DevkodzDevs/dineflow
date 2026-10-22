"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { HandPlatter, Receipt, GlassWater, Check, Star, X, BellRing, Footprints, Send, LoaderCircle } from "lucide-react";
import { cn } from "@/components/ui";
import { buzz } from "@/lib/buzz";
import { callTable, tableCalls } from "../actions";

type Kind = "waiter" | "bill" | "water";
type Call = { kind: string; status: string; at?: string; done_at?: string | null };
type Info = { label: string; idle: string; asked: string; title: string; next: (table: string) => string; Icon: typeof HandPlatter; hue: string; hue2: string };
const ASK: Record<Kind, Info> = {
  waiter: { label: "Call waiter", idle: "Someone comes over", asked: "Waiter called", title: "Waiter called", next: (t) => `A waiter will come to Table ${t} shortly.`, Icon: HandPlatter, hue: "var(--color-tint)", hue2: "var(--color-green-2)" },
  bill: { label: "Bill please", idle: "Bring the bill", asked: "Bill asked for", title: "Bill requested", next: (t) => `Your bill will be brought to Table ${t}. Pay by cash, UPI or card at the table.`, Icon: Receipt, hue: "var(--color-blue)", hue2: "var(--color-blue-2)" },
  water: { label: "Water", idle: "A fresh jug", asked: "Water asked for", title: "Water requested", next: (t) => `Someone will bring water to Table ${t}.`, Icon: GlassWater, hue: "var(--color-cyan)", hue2: "var(--color-cyan-2)" },
};
const KINDS: Kind[] = ["waiter", "bill", "water"];
const hm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const minsSince = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);

type Open = { kind: Kind; phase: "sending" | "sent" | "again" | "error"; error?: string };

/**
 * At a table (the table's QR, 0103; redesigned 2026-10-23): three tiles — Call waiter, Bill please, Water. A tap sends it
 * to the staff (their Orders floor, their alert and, since 2026-10-23, a call dialog on every staff device that hears
 * table calls — CallAlert.tsx) and opens a dialog here that says what was sent, when, and where it stands: sent →
 * the staff have it → someone is on the way, live. A second tap while it is open sends nothing new. The page asks every
 * 15 seconds, every 5 while the dialog is open; a request turning "on the way" buzzes the phone.
 * Public pages have no ToastProvider — everything is said here, inline or in the dialog.
 */
export function TableCalls({ slug, token, table }: { slug: string; token: string; table: string }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const before = useRef<Record<string, string>>({});

  const load = useCallback(() => {
    void tableCalls(slug, token).then((r) => {
      if (!("calls" in r) || !r.calls) return;
      /* a request someone has just picked up: buzz, and say so if the dialog is not already showing it */
      for (const c of r.calls) {
        const was = before.current[c.kind];
        if (was === "open" && c.status === "done") { buzz("done"); setNote(`${ASK[c.kind as Kind]?.label ?? "Your request"} — someone is on the way`); }
      }
      before.current = Object.fromEntries(r.calls.map((c) => [c.kind, c.status]));
      setCalls(r.calls);
    });
  }, [slug, token]);
  useEffect(() => { load(); const t = setInterval(load, open ? 5000 : 15000); return () => clearInterval(t); }, [load, open]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(null), 7000); return () => clearTimeout(t); }, [note]);

  /* the newest call of each kind, within the half hour the server keeps */
  const latest = (k: Kind) => calls.find((c) => c.kind === k) ?? null;

  const ask = async (k: Kind) => {
    buzz("tap");
    setOpen({ kind: k, phase: "sending" });
    const r = await callTable(slug, token, k);
    if ("error" in r) { setOpen({ kind: k, phase: "error", error: r.error }); return; }
    buzz("sent");
    /* shown at once, before the next poll: the tile turns "asked" the moment the server has it */
    setCalls((cs) => [{ kind: k, status: r.call?.status ?? "open", at: (r.call as { at?: string } | undefined)?.at ?? new Date().toISOString(), done_at: null }, ...cs.filter((c) => c.kind !== k)]);
    before.current[k] = r.call?.status ?? "open";
    setOpen({ kind: k, phase: r.call?.again ? "again" : "sent" });
    load();
  };

  return (
    <div className="mb-6 rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4 shadow-[var(--shadow-card)]" data-table-calls>
      <div className="flex items-center justify-between gap-2 mb-3.5">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-tight">Need something at {table}?</div>
          <div className="mt-0.5 text-[12.5px] text-[var(--color-label-2)]">Tap once — the staff are told straight away</div>
        </div>
        <span className="shrink-0 h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[11.5px] font-bold bg-[var(--color-green-2)] text-[var(--color-green)]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)] animate-pulse" aria-hidden />Live</span>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KINDS.map((k) => {
          const { label, idle, asked, Icon, hue, hue2 } = ASK[k]; const c = latest(k); const st = c?.status ?? null;
          const busy = open?.kind === k && open.phase === "sending";
          return (
            <button key={k} type="button" disabled={busy} data-call-kind={k} data-state={st ?? "none"} onClick={() => void ask(k)}
              aria-label={st === "open" ? `${asked} — see details` : st === "done" ? `${label} — someone is on the way` : label}
              style={{ ["--hue" as string]: st === "done" ? "var(--color-green)" : hue, ["--hue-2" as string]: st === "done" ? "var(--color-green-2)" : hue2 }}
              className={cn("relative min-h-[118px] rounded-[20px] p-2.5 pt-3 flex flex-col items-center justify-start gap-2 text-center border transition-[transform,background-color,border-color] duration-150 active:scale-[.96] select-none",
                st ? "border-[color-mix(in_srgb,var(--hue)_45%,transparent)] bg-[color-mix(in_srgb,var(--hue)_9%,var(--color-bg-2))]" : "border-[var(--color-separator)] bg-[var(--color-bg)] hover:border-[color-mix(in_srgb,var(--hue)_40%,transparent)]")}>
              <span className={cn("relative h-12 w-12 rounded-[16px] grid place-items-center bg-[var(--hue-2)] text-[var(--hue)]", st === "open" && "call-ring")} aria-hidden>
                {busy ? <LoaderCircle size={24} className="animate-spin" /> : st === "done" ? <Check size={24} strokeWidth={2.8} /> : <Icon size={24} />}
              </span>
              <span className="text-[13.5px] font-bold leading-tight text-[var(--color-label)]">{st === "open" ? asked : st === "done" ? "On the way" : label}</span>
              <span className={cn("text-[11px] font-semibold leading-tight", st ? "text-[var(--hue)]" : "text-[var(--color-label-3)]")}>
                {st === "open" ? `Sent · ${minsSince(c?.at, now) ? `${minsSince(c?.at, now)} min` : "just now"}` : st === "done" ? "Someone's coming" : idle}
              </span>
            </button>
          );
        })}
      </div>
      {note && <p role="status" aria-live="polite" className="call-in mt-3 rounded-[14px] px-3 py-2.5 text-[13.5px] font-semibold text-center text-[var(--color-green)] bg-[var(--color-green-2)]" data-call-msg>{note}</p>}
      <Link href={`/feedback/${slug}?t=${encodeURIComponent(token)}`} className="mt-3 min-h-11 rounded-xl flex items-center justify-center gap-1.5 text-[13.5px] font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]" data-rate-link>
        <Star size={15} aria-hidden /> How was your meal? Rate us
      </Link>
      <CallDialog open={open} call={open ? latest(open.kind) : null} table={table} now={now} onClose={() => setOpen(null)} onRetry={(k) => void ask(k)} />
    </div>
  );
}

/** The detail of one request: what was sent, when, and where it stands — sent, the staff have it, on the way. */
function CallDialog({ open, call, table, now, onClose, onRetry }: { open: Open | null; call: Call | null; table: string; now: number; onClose: () => void; onRetry: (k: Kind) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return; closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  const info = open ? ASK[open.kind] : null;
  const done = call?.status === "done"; const sent = !!open && (open.phase === "sent" || open.phase === "again");
  const waited = minsSince(call?.at, now);
  return (
    <AnimatePresence>{open && info && (
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
        <motion.div role="dialog" aria-modal="true" aria-labelledby="call-title" data-call-dialog={open.kind} data-phase={done ? "done" : open.phase}
          initial={{ y: 40, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
          style={{ ["--hue" as string]: open.phase === "error" ? "var(--color-red)" : done ? "var(--color-green)" : info.hue, ["--hue-2" as string]: open.phase === "error" ? "var(--color-red-2)" : done ? "var(--color-green-2)" : info.hue2 }}
          className="relative w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[28px] bg-[var(--color-bg-2)] px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)]">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-[var(--color-fill-2)] sm:hidden" aria-hidden />
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 h-11 w-11 rounded-full grid place-items-center text-[var(--color-label-2)] hover:bg-[var(--color-fill)]"><X size={20} /></button>

          <div className="flex flex-col items-center text-center pt-3">
            <span className="relative h-[76px] w-[76px] grid place-items-center">
              {sent && !done && <><span className="absolute inset-0 rounded-full bg-[var(--hue-2)] call-ripple" /><span className="absolute inset-0 rounded-full bg-[var(--hue-2)] call-ripple [animation-delay:-1s]" /></>}
              <span className="relative h-[76px] w-[76px] rounded-full grid place-items-center bg-[var(--hue)] text-[var(--color-on-tint)] shadow-[0_14px_30px_-14px_var(--hue)]">
                {open.phase === "sending" ? <LoaderCircle size={34} className="animate-spin" /> : open.phase === "error" ? <X size={34} strokeWidth={2.6} /> : done ? <Check size={36} strokeWidth={3} /> : <info.Icon size={34} />}
              </span>
            </span>
            <h2 id="call-title" className="mt-4 text-[24px] leading-tight">
              {open.phase === "sending" ? "Sending…" : open.phase === "error" ? "Couldn't send that" : done ? "Someone's on the way" : open.phase === "again" ? "Already on it" : info.title}
            </h2>
            <p className="mt-1.5 text-[14px] text-[var(--color-label-2)] max-w-[30ch]">
              {open.phase === "error" ? open.error : open.phase === "again" && !done ? `You asked at ${hm(call?.at)} — it is still with the staff. No need to ask again.` : info.next(table)}
            </p>
          </div>

          {open.phase !== "error" && (
            <div className="mt-5 rounded-[18px] bg-[var(--color-bg)] border border-[var(--color-separator)] p-4">
              <div className="flex items-center justify-between text-[13px] pb-3 mb-3 border-b border-[var(--color-separator)]">
                <span className="text-[var(--color-label-2)]">Table <b className="text-[var(--color-label)] num">{table}</b></span>
                <span className="font-semibold" style={{ color: "var(--hue)" }}>{info.label}</span>
              </div>
              <ol className="space-y-3" data-call-steps>
                <Step on={sent} Icon={Send} title="Request sent" sub={sent ? `at ${hm(call?.at)}` : "Sending…"} />
                <Step on={sent} Icon={BellRing} title="Staff alerted" sub={sent ? "It rang on the floor team's phones and the till" : "—"} />
                <Step on={done} live={sent && !done} Icon={Footprints} title="On the way" sub={done ? `Picked up${call?.done_at ? ` at ${hm(call.done_at)}` : ""} — coming to your table` : sent ? `Waiting for someone to pick it up${waited ? ` · ${waited} min` : ""}` : "—"} last />
              </ol>
            </div>
          )}
          {sent && !done && waited >= 5 && <p className="mt-3 text-center text-[13px] text-[var(--color-orange)] font-semibold" data-call-slow>Taking a while? Wave to any of the staff — they can see your request too.</p>}

          <div className="mt-5 flex gap-2">
            {open.phase === "error" && <button type="button" onClick={() => onRetry(open.kind)} className="btn btn-gray flex-1 !h-12">Try again</button>}
            <button type="button" onClick={onClose} className="btn btn-filled flex-1 !h-12 !text-[15px]">{open.phase === "error" ? "Close" : "Done"}</button>
          </div>
        </motion.div>
      </motion.div>
    )}</AnimatePresence>
  );
}

function Step({ on, live, Icon, title, sub, last }: { on: boolean; live?: boolean; Icon: typeof Send; title: string; sub: string; last?: boolean }) {
  return (
    <li className="relative flex items-start gap-3" data-on={on}>
      {!last && <span className={cn("absolute left-[15px] top-8 bottom-[-12px] w-0.5 rounded-full", on ? "bg-[var(--hue)]" : "bg-[var(--color-fill-2)]")} aria-hidden />}
      <span className={cn("relative h-8 w-8 shrink-0 rounded-full grid place-items-center", on ? "bg-[var(--hue)] text-[var(--color-on-tint)]" : live ? "bg-[var(--hue-2)] text-[var(--hue)] call-ring" : "bg-[var(--color-fill)] text-[var(--color-label-3)]")} aria-hidden>
        {on ? <Check size={16} strokeWidth={3} /> : <Icon size={15} />}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className={cn("block text-[14px] font-bold leading-tight", !on && !live && "text-[var(--color-label-3)]")}>{title}</span>
        <span className="block text-[12.5px] text-[var(--color-label-2)] leading-snug mt-0.5">{sub}</span>
      </span>
    </li>
  );
}
