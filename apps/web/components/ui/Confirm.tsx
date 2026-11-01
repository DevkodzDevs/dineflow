"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, LogOut, Trash2, CheckCircle2, HelpCircle } from "lucide-react";
import { clsx } from "clsx";
import { snap } from "@/lib/motion";

/**
 * The app's own yes/no question (2026-10-30, the owner: "not the browser's 'dineflow.cloud says' box — a dialog with an
 * ultra modern, friendly design"). `await ask({ title, body, ok, tone })` resolves true or false, so a screen swaps
 * `if (!confirm("…")) return;` for `if (!(await ask({ … }))) return;` and nothing else moves.
 *
 * One host (<ConfirmHost/>, in the root layout) draws it: a centred card over the scrim, an icon tile in the tone, the
 * question, a short line, and two full-width buttons. Escape or a tap outside is No; Enter is Yes. A destructive question
 * puts the focus on Cancel, so a stray Enter never deletes. If the host is not mounted the browser's box is the fallback.
 *
 * `askText` (2026-10-31, the owner: the browser's "Room 102 — what failed?" box "is not good") is the same card with a box
 * for a few words and optional quick chips; it resolves the words typed, or null for Cancel.
 */
export type AskOpts = { title: string; body?: string; ok?: string; cancel?: string; tone?: "danger" | "go"; icon?: "out" | "trash" | "alert" | "check" | "ask" };
export type AskTextOpts = AskOpts & { placeholder?: string; chips?: string[]; min?: number; max?: number };
type Pending = AskTextOpts & { text?: boolean; done: (v: boolean | string) => void };

let show: ((p: Pending) => void) | null = null;
export function ask(o: AskOpts): Promise<boolean> {
  if (!show) return Promise.resolve(typeof window !== "undefined" && window.confirm([o.title, o.body].filter(Boolean).join("\n\n")));
  return new Promise((done) => show!({ ...o, done: (v) => done(v === true) }));
}
/** `const why = await askText({ title, placeholder, chips })` — the words typed (trimmed), or null for Cancel. A chip fills the
 *  box and can still be edited; OK stays off until there are `min` characters (1 by default). */
export function askText(o: AskTextOpts): Promise<string | null> {
  if (!show) { const r = typeof window !== "undefined" ? window.prompt(o.title) : null; return Promise.resolve(r && r.trim() ? r.trim() : null); }
  return new Promise((done) => show!({ ...o, text: true, done: (v) => done(typeof v === "string" ? v : null) }));
}

const ICON = { out: LogOut, trash: Trash2, alert: AlertTriangle, check: CheckCircle2, ask: HelpCircle } as const;

export function ConfirmHost() {
  const [q, setQ] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const okRef = useRef<HTMLButtonElement>(null), noRef = useRef<HTMLButtonElement>(null), inRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { show = (p) => setQ((prev) => { prev?.done(false); return p; }); return () => { show = null; }; }, []);
  const enough = !q?.text || text.trim().length >= (q.min ?? 1);
  const close = (v: boolean) => setQ((p) => { p?.done(v && p.text ? text.trim() : v); return null; });
  useEffect(() => {
    if (!q) return;
    setText("");
    /* a text question puts the cursor in the box — but not on a touch screen, where the keyboard would rise before the dialog
       is seen (the Sheet's rule); a tap on the box or a chip brings it */
    if (q.text) { if (!window.matchMedia("(pointer: coarse)").matches) requestAnimationFrame(() => inRef.current?.focus({ preventScroll: true })); }
    else (q.tone === "danger" ? noRef : okRef).current?.focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(false); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const danger = q?.tone === "danger";
  const Icon = ICON[q?.icon ?? (danger ? "alert" : "ask")];
  return (
    <AnimatePresence>
      {q && (
        <motion.div key="ask" className="fixed inset-0 z-[70] grid place-items-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .16 }}>
          <div className="absolute inset-0 scrim backdrop-blur-[6px]" onClick={() => close(false)} />
          <motion.div role="alertdialog" aria-modal aria-labelledby="ask-t" aria-describedby={q.body ? "ask-b" : undefined} data-ask
            initial={{ opacity: 0, scale: .94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96, y: 6 }} transition={snap}
            className="relative w-full max-w-[380px] material-thick rounded-[28px] shadow-[var(--shadow-pop)] p-6 pt-7 text-center">
            <span aria-hidden className={clsx("mx-auto mb-4 grid place-items-center h-14 w-14 rounded-[18px]",
              danger ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-tint-2,var(--color-fill))] text-[var(--color-tint)]")}>
              <Icon size={26} strokeWidth={2.2} />
            </span>
            <h2 id="ask-t" className="text-[21px] font-display leading-tight">{q.title}</h2>
            {q.body && <p id="ask-b" className="mt-2 text-[14.5px] leading-snug text-[var(--color-label-2)]">{q.body}</p>}
            {q.text && (
              <div className="mt-4 text-left" data-ask-text>
                {!!q.chips?.length && <div className="mb-2.5 flex flex-wrap gap-1.5 justify-center">
                  {q.chips.map((c) => <button key={c} type="button" onClick={() => setText(c)} aria-pressed={text === c} data-ask-chip
                    className={clsx("h-9 [@media(pointer:coarse)]:h-11 px-3.5 rounded-full text-[13.5px] font-semibold transition active:scale-95", text === c ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>{c}</button>)}
                </div>}
                <textarea ref={inRef} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={q.max ?? 160} placeholder={q.placeholder ?? "A few words"} aria-label={q.title}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && enough) { e.preventDefault(); close(true); } }}
                  className="w-full resize-none rounded-[16px] bg-[var(--color-fill)] px-4 py-3 text-[15px] leading-snug outline-none border border-transparent focus:border-[var(--color-tint)] focus:bg-[var(--color-card)] transition" />
              </div>
            )}
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <button ref={noRef} type="button" data-ask-no onClick={() => close(false)}
                className="h-12 rounded-[16px] font-semibold text-[15px] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] active:scale-[.97] transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-tint)]">{q.cancel ?? "Cancel"}</button>
              <button ref={okRef} type="button" data-ask-yes disabled={!enough} onClick={() => close(true)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (enough) close(true); } }}
                className={clsx("h-12 rounded-[16px] font-semibold text-[15px] active:scale-[.97] transition outline-none disabled:opacity-40 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-card)]",
                  danger ? "bg-[var(--color-red)] text-white focus-visible:ring-[var(--color-red)]" : "bg-[var(--color-tint)] text-[var(--color-on-tint,white)] focus-visible:ring-[var(--color-tint)]")}>{q.ok ?? "OK"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
