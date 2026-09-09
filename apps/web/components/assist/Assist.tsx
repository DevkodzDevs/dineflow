"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowUp, RotateCcw, Mic, MicOff, Check, Copy, ChevronRight } from "lucide-react";
import { AssistMark, type MarkState } from "./Mark";
import { cn, tap, Loader } from "@/components/ui";

type Msg = { role: "user" | "assistant"; content: string; action?: Act; done?: string; text?: string };
type Act = { kind: string; label: string; arg: string };
type Insight = { tone: "alert" | "warn" | "good" | "info"; text: string; go?: string; action?: { kind: string; label: string; args: Record<string, string | number> } };
const SUGGEST: Record<string, string[]> = {
  dashboard: ["What needs me most right now?", "How is today against a normal day?", "Which table has sat longest?"],
  kitchen: ["Which ticket is most late, and why?", "Can the kitchen take the queue right now?", "Read me everything over 15 minutes"],
  inventory: ["What do I reorder today, and how much?", "Where is stock leaking?", "What runs out first at this pace?"],
  pulse: ["How long for a party of 4, honestly?", "Should I call the next party yet?", "Which table frees first and why?"],
  billing: ["What should be in the till right now?", "Any bills sitting unpaid?", "Write tonight's summary for the owner"],
  tomorrow: ["Why this many covers?", "What do I prep first tonight?", "Is the market list right for the bookings?"],
  neighbours: ["Where am I overpaying?", "Anything going spare nearby I could use?", "Who can cover a shift tonight?"],
  proof: ["Is the chain intact?", "Summarise the last three months for a bank", "Which month was best, and why?"],
  reservations: ["Who arrives in the next hour?", "Any occasions I should have ready?", "Room for a walk-in of 6 at 8?"],
  rooms: ["How full tonight, and who's still to arrive?", "Which rooms to turn first?", "Who checks out tomorrow?"],
  frontdesk: ["Who's arriving and is their room ready?", "Any folio to check before checkout?", "Free rooms tonight?"],
  housekeeping: ["Which room first?", "Any arrival waiting on a room?", "How many left to turn?"],
  menu: ["What sold best today?", "What hasn't sold this week?", "Is anything priced too low for its cost?"],
  labour: ["Who's on shift, who's missing?", "What are wages today?", "Do I have enough hands for tonight's bookings?"],
  reports: ["This month against last?", "What was the best day, and why?", "Where did the money go?"],
  orders: ["Which order has waited longest?", "How much is on the floor unbilled?", "Any online orders waiting?"],
};
const SCREEN: Record<string, string> = { dashboard: "Control room", orders: "Orders", kitchen: "Kitchen", billing: "Billing", inventory: "Pantry", menu: "Menu", rooms: "Rooms", frontdesk: "Front desk", housekeeping: "Housekeeping", reservations: "Reservations", pulse: "Pulse", tomorrow: "Tomorrow", neighbours: "Neighbours", proof: "Proof of business", labour: "Labour", reports: "Reports", "online-orders": "Online orders", settings: "Settings", staff: "Staff", guests: "Guests", facilities: "Facilities", invoices: "Invoices", channels: "Channels", scan: "Scan" };
const TONE = { alert: "bg-[var(--color-red-2)] text-[var(--color-red)]", warn: "bg-[rgb(255_179_64/.14)] text-[var(--color-orange)]", good: "bg-[var(--color-green-2)] text-[var(--color-green)]", info: "bg-[var(--color-fill)] text-[var(--color-label-2)]" } as const;

/**
 * Assist. It notices before you ask (insights run on every screen and show on the mark), answers as
 * a stream from this screen's facts plus a whole-house snapshot, and can do a short list of things —
 * only after you tap Confirm. ⌘J opens it; the mic listens if the browser can.
 */
export function Assist() {
  const path = usePathname(); const router = useRouter(); const section = (path.split("/")[1] || "dashboard").toLowerCase();
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [ins, setIns] = useState<Insight[]>([]); const [seenKey, setSeenKey] = useState(""); const [listening, setListening] = useState(false); const [copied, setCopied] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null); const rec = useRef<{ stop: () => void } | null>(null);

  // notice things: on every screen, then every 90 s, quietly
  const notice = useCallback(async () => { try { const r = await fetch("/api/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, mode: "insights" }) }); if (r.ok) { const d = await r.json(); setIns(d.insights ?? []); } } catch { /* offline: stay quiet */ } }, [path]);
  useEffect(() => { setMsgs([]); notice(); const i = setInterval(notice, 90000); return () => clearInterval(i); }, [section, notice]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  useEffect(() => { if (open) { setSeenKey(ins.map((i) => i.text).join("|")); setTimeout(() => input.current?.focus(), 80); } }, [open, ins]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const urgent = ins.filter((i) => i.tone === "alert" || i.tone === "warn"); const unseen = ins.length > 0 && ins.map((i) => i.text).join("|") !== seenKey;
  const state: MarkState = busy ? "thinking" : urgent.length && unseen ? "alert" : "idle";

  const ask = async (text: string) => {
    const t = text.trim(); if (!t || busy) return; tap();
    const next: Msg[] = [...msgs, { role: "user", content: t }]; setMsgs([...next, { role: "assistant", content: "" }]); setQ(""); setBusy(true);
    try {
      const r = await fetch("/api/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, mode: "chat", messages: next.map(({ role, content }) => ({ role, content })) }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? `error ${r.status}`); }
      if (r.headers.get("content-type")?.includes("application/json")) { const d = await r.json(); setMsgs([...next, { role: "assistant", content: d.reply }]); }
      else {
        const reader = r.body!.getReader(); const dec = new TextDecoder(); let acc = "";
        for (;;) { const { value, done } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); const shown = acc.replace(/<action[^>]*\/>\s*$/, ""); setMsgs([...next, { role: "assistant", content: shown }]); }
        const m = /<action kind="([a-z_]+)" label="([^"]*)" arg="([^"]*)"\s*\/>/.exec(acc);
        setMsgs([...next, { role: "assistant", content: acc.replace(/<action[^>]*\/>/g, "").trim(), action: m ? { kind: m[1], label: m[2], arg: m[3] } : undefined }]);
      }
    } catch (e) { setMsgs([...next, { role: "assistant", content: e instanceof Error ? e.message : "I couldn't reach the server." }]); }
    setBusy(false);
  };
  const act = async (i: number, a: Act) => {
    tap(); const r = await fetch("/api/assist/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: a.kind, arg: a.arg }) }); const d = await r.json();
    setMsgs((m) => m.map((x, k) => k === i ? { ...x, action: undefined, done: d.done ?? d.error, text: d.text } : x));
    if (d.go) { setOpen(false); router.push(d.go); } notice();
  };
  const listen = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }); const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition; if (!Ctor) return;
    if (listening) { rec.current?.stop(); setListening(false); return; }
    const r = new Ctor(); r.lang = "en-IN"; r.interimResults = true; rec.current = r; setListening(true); tap();
    r.onresult = (e: SpeechRecognitionEvent) => { const t = Array.from({ length: e.results.length }, (_, k) => e.results[k][0].transcript).join(""); setQ(t); if (e.results[e.results.length - 1].isFinal) { setListening(false); ask(t); } };
    r.onend = () => setListening(false); r.onerror = () => setListening(false); r.start();
  };
  const screen = SCREEN[section] ?? "DineFlow"; const suggest = SUGGEST[section] ?? SUGGEST.dashboard; const canListen = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return (
    <>
      <motion.button onClick={() => { tap(); setOpen(true); }} aria-label={`Open Assist (⌘J)${urgent.length ? ` · ${urgent.length} things need you` : ""}`} title={urgent[0]?.text ?? "Assist · ⌘J"}
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: .4 }} whileTap={{ scale: .92 }}
        className={cn("fixed z-40 right-4 md:right-6 bottom-[calc(max(10px,env(safe-area-inset-bottom))+84px)] md:bottom-6 h-14 w-14 rounded-full grid place-items-center bg-[#0a0a0d]", state === "alert" ? "shadow-[0_0_0_1px_rgb(255_255_255/.08),0_16px_40px_-12px_rgb(0_0_0/.9),0_0_0_6px_rgb(255_69_58/.14)]" : "shadow-[0_0_0_1px_rgb(255_255_255/.08),0_16px_40px_-12px_rgb(0_0_0/.9),0_0_0_6px_rgb(76_217_100/.08)]", open && "opacity-0 pointer-events-none")}>
        <AssistMark size={32} state={state} />
        {urgent.length > 0 && unseen && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-[#ff453a] text-white text-[11px] font-display grid place-items-center ring-2 ring-[#0a0a0d]">{urgent.length}</span>}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/40 md:bg-transparent md:pointer-events-none" />
            <motion.aside role="dialog" aria-label={`Assist on ${screen}`} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed z-50 inset-x-2 bottom-2 md:inset-auto md:right-6 md:bottom-6 md:top-6 md:w-[420px] flex flex-col max-h-[88dvh] md:max-h-none rounded-[28px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[0_40px_100px_-30px_rgb(0_0_0/.9),0_0_0_1px_rgb(255_255_255/.04)]">
              <header className="flex items-center gap-3 px-4 pt-4 pb-3">
                <AssistMark size={30} state={busy ? "thinking" : "idle"} />
                <div className="flex-1 min-w-0"><div className="font-display text-lg leading-none tracking-wide">Assist</div><div className="text-[12px] text-[var(--color-label-2)] mt-1 truncate">Reading <b className="text-[var(--color-label)]">{screen}</b> and the whole house</div></div>
                {msgs.length > 0 && <button onClick={() => setMsgs([])} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--color-fill)]" aria-label="Start over"><RotateCcw size={15} /></button>}
                <button onClick={() => setOpen(false)} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--color-fill)]" aria-label="Close"><X size={17} /></button>
              </header>
              <div className="hairline" />
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {msgs.length === 0 && (<>
                  {ins.length > 0 && <div className="space-y-2">
                    <p className="text-[12px] text-[var(--color-label-2)] font-display tracking-wide">Right now</p>
                    {ins.map((i) => <div key={i.text} className={cn("rounded-2xl px-3.5 py-3 text-[14px] leading-snug flex items-start gap-2", TONE[i.tone])}>
                      <span className="flex-1 text-[var(--color-label)]">{i.text}</span>
                      {i.go && i.go !== path && <button onClick={() => { setOpen(false); router.push(i.go!); }} className="shrink-0 h-7 w-7 rounded-full grid place-items-center bg-[var(--color-bg-2)]/60" aria-label="Go"><ChevronRight size={15} /></button>}
                    </div>)}
                    {ins.find((i) => i.action) && <button onClick={() => { const a = ins.find((i) => i.action)!.action!; setMsgs([{ role: "user", content: a.label }, { role: "assistant", content: "Ready when you are.", action: { kind: a.kind, label: a.label, arg: String(a.args.id ?? "") } }]); }} className="btn btn-tinted !h-10 w-full">{ins.find((i) => i.action)!.action!.label}</button>}
                  </div>}
                  <div className="space-y-2">
                    <p className="text-[12px] text-[var(--color-label-2)] font-display tracking-wide">Worth asking here</p>
                    {suggest.map((s) => <button key={s} onClick={() => ask(s)} className="block w-full text-left rounded-2xl border border-[var(--color-separator)] px-4 py-3 text-[14px] hover:bg-[var(--color-fill)] transition">{s}</button>)}
                  </div>
                </>)}
                {msgs.map((m, i) => (
                  <div key={i} className={cn("max-w-[92%]", m.role === "user" ? "ml-auto" : "")}>
                    <div className={cn("rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap min-h-[38px]", m.role === "user" ? "bg-[var(--color-label)] text-[var(--color-on-label)] rounded-br-md" : "bg-[var(--color-fill)] rounded-bl-md")}>{m.content || (busy && i === msgs.length - 1 ? <Loader size="xs" className="!-my-0.5" /> : "")}</div>
                    {m.action && <button onClick={() => act(i, m.action!)} className="btn btn-filled !h-10 mt-2"><Check size={15} /> {m.action.label}</button>}
                    {m.done && <div className="text-[13px] text-[var(--color-label-2)] mt-2 px-1">{m.done}</div>}
                    {m.text && <div className="mt-2 rounded-2xl bg-[var(--color-bg-3)] p-3 text-[13px] whitespace-pre-wrap relative">{m.text}<button onClick={() => { navigator.clipboard.writeText(m.text!); setCopied(i); }} className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-[var(--color-bg-2)]" aria-label="Copy">{copied === i ? <Check size={14} /> : <Copy size={14} />}</button></div>}
                  </div>
                ))}
                <div ref={end} />
              </div>
              <div className="p-3 pt-0">
                <div className={cn("flex items-end gap-2 rounded-2xl bg-[var(--color-bg-3)] p-2 pl-4 focus-within:ring-2 focus-within:ring-[rgb(76_217_100/.5)]", listening && "ring-2 ring-[rgb(255_69_58/.6)]")}>
                  <textarea ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} rows={1} placeholder={listening ? "Listening…" : `Ask about ${screen.toLowerCase()}, or anything in the house…`} className="assist-input resize-none text-[15px] max-h-32" />
                  {canListen && <button onClick={listen} aria-label={listening ? "Stop listening" : "Speak"} className={cn("h-10 w-10 shrink-0 rounded-full grid place-items-center transition", listening ? "bg-[#ff453a] text-white" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</button>}
                  <button onClick={() => ask(q)} disabled={!q.trim() || busy} aria-label="Send" className="h-10 w-10 shrink-0 rounded-full grid place-items-center bg-[#4cd964] text-[#06120a] disabled:opacity-30 transition"><ArrowUp size={18} strokeWidth={2.5} /></button>
                </div>
                <div className="text-[11px] text-[var(--color-label-3)] mt-2 px-1">Does things only after you tap Confirm · ⌘J anywhere</div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
