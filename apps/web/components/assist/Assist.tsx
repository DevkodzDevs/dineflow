"use client";
import { whenSettled } from "@/lib/idle";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowUp, RotateCcw, Mic, MicOff, Check, Copy, ChevronRight, ChevronDown, FileText, Download, Share2, Stethoscope, Lock, Sparkles, CircleCheck } from "lucide-react";
import { AssistMark, type MarkState } from "./Mark";
import { cn, tap, Loader } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import type { AssistAction as Act, AssistDoc, AssistEvent, Finding } from "@/lib/assist/protocol";

type Msg = { role: "user" | "assistant"; content: string; think?: string; steps?: string[]; findings?: Finding[]; fixed?: string[]; docs?: AssistDoc[]; actions?: Act[]; done?: string; text?: string; failed?: boolean };
type Insight = { tone: "alert" | "warn" | "good" | "info"; text: string; go?: string; action?: { kind: string; label: string; args: Record<string, string | number> } };
type Topic = { key: string; label: string };
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
const SCREEN: Record<string, string> = { dashboard: "Control room", orders: "Orders", kitchen: "Kitchen", billing: "Billing", inventory: "Pantry", menu: "Menu", rooms: "Rooms", frontdesk: "Front desk", housekeeping: "Housekeeping", reservations: "Reservations", pulse: "Pulse", tomorrow: "Tomorrow", neighbours: "Neighbours", proof: "Proof of business", labour: "Labour", reports: "Reports", "online-orders": "Online orders", settings: "Settings", staff: "Staff", guests: "Guests", facilities: "Facilities", invoices: "Invoices", channels: "Channels", scan: "Scan", tables: "Tables", payroll: "Payroll", expenses: "Expenses" };
const LEVEL = { problem: ["Problem", "var(--color-red)"], warning: ["Warning", "var(--color-orange)"], note: ["Note", "var(--color-label-3)"] } as const;
const TONE = { alert: "bg-[var(--color-red-2)] text-[var(--color-red)]", warn: "bg-[rgb(255_179_64/.14)] text-[var(--color-orange)]", good: "bg-[var(--color-green-2)] text-[var(--color-green)]", info: "bg-[var(--color-fill)] text-[var(--color-label-2)]" } as const;
const HEALTH = "Check the whole app for problems — what's wrong, what caused it, and how to fix it.";

/**
 * Assist. It notices before you ask (insights run on every screen and show on the mark), thinks it through (its
 * reasoning shows as a faint live line, folded away once it answers), reads the records your role opens, runs a
 * health check that names each problem's cause and fix, makes PDF documents with a Download button, and does a short
 * list of things — only after you tap. ⌘J opens it; the mic listens if the browser can.
 */
/** the first screen of a visit has settled once (whenSettled) — later screens wait less */
let booted = false;
export function Assist() {
  const path = usePathname(); const router = useRouter(); const section = (path.split("/")[1] || "dashboard").toLowerCase();
  const [open, setOpen] = useState(false); const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const [ins, setIns] = useState<Insight[]>([]); const [topics, setTopics] = useState<Topic[]>([]); const [docPick, setDocPick] = useState(false);
  const [seenKey, setSeenKey] = useState(""); const [listening, setListening] = useState(false); const [copied, setCopied] = useState<number | null>(null);
  const [unfold, setUnfold] = useState<number | null>(null); const [saving, setSaving] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null); const input = useRef<HTMLTextAreaElement>(null); const rec = useRef<{ stop: () => void } | null>(null);
  const errs = useRef<string[]>([]); const stop = useRef<AbortController | null>(null);

  // notice things: on every screen, then every 90 s, quietly
  const notice = useCallback(async () => { try { const r = await fetch("/api/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, mode: "insights" }) }); if (r.ok) { const d = await r.json(); setIns(d.insights ?? []); setTopics(d.topics ?? []); } } catch { /* offline: stay quiet */ } }, [path]);
  // after the screen, not with it (lib/idle.ts, 2026-10-23): the first screen's load had this request queued beside it
  useEffect(() => { setMsgs([]); setDocPick(false); const cancel = whenSettled(notice, booted ? 900 : 2500); booted = true; const i = setInterval(notice, 90000); return () => { cancel(); clearInterval(i); }; }, [section, notice]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); } if (e.key === "Escape") setOpen(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  // what went wrong in this tab, so "it's not working" can be answered from the actual error
  useEffect(() => {
    const keep = (m: string) => { errs.current = [...errs.current.slice(-7), `${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} on ${location.pathname}: ${m}`.slice(0, 300)]; };
    const onErr = (e: ErrorEvent) => keep(e.message || "script error"); const onRej = (e: PromiseRejectionEvent) => keep(e.reason instanceof Error ? e.reason.message : String(e.reason ?? "rejected"));
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  useEffect(() => { if (open) { setSeenKey(ins.map((i) => i.text).join("|")); setTimeout(() => input.current?.focus(), 80); } }, [open, ins]);
  /* A one-row box that never grows hides everything above the last line behind a scrollbar. This
     lets the field take the height of what is in it — an empty one is exactly the height of the
     buttons beside it — and only starts scrolling once it reaches the cap. */
  useEffect(() => {
    const el = input.current; if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [q, open]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  const urgent = ins.filter((i) => i.tone === "alert" || i.tone === "warn"); const unseen = ins.length > 0 && ins.map((i) => i.text).join("|") !== seenKey;
  const state: MarkState = busy ? "thinking" : urgent.length && unseen ? "alert" : "idle";

  const ask = async (text: string) => {
    const t = text.trim(); if (!t || busy) return; tap(); setDocPick(false);
    const next: Msg[] = [...msgs, { role: "user", content: t }];
    let cur: Msg = { role: "assistant", content: "" }; const show = () => setMsgs([...next, { ...cur }]);
    show(); setQ(""); setBusy(true); const ac = new AbortController(); stop.current = ac;
    // the model sees what it said before, and which documents it already made
    const history = next.map(({ role, content, docs }) => ({ role, content: (content + (docs?.length ? `\n[PDF made: ${docs.map((d) => d.title).join("; ")}]` : "")).slice(0, 2000) || "…" }));
    try {
      const r = await fetch("/api/assist", { method: "POST", signal: ac.signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ path, mode: "chat", messages: history, errors: errs.current }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? `error ${r.status}`); }
      const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = "";
      const take = (e: AssistEvent) => {
        if (e.t === "text") cur = { ...cur, content: cur.content + e.d };
        else if (e.t === "think") cur = { ...cur, think: (cur.think ?? "") + e.d };
        else if (e.t === "step") cur = { ...cur, steps: [...(cur.steps ?? []), e.d] };
        else if (e.t === "findings") cur = { ...cur, findings: [...(cur.findings ?? []), ...e.f] };
        else if (e.t === "doc") cur = { ...cur, docs: [...(cur.docs ?? []), e.doc] };
        else if (e.t === "action") cur = { ...cur, actions: [...(cur.actions ?? []), e.a] };
        else if (e.t === "error") cur = { ...cur, content: (cur.content ? cur.content + "\n\n" : "") + e.d, failed: true };
      };
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const l of lines) if (l.trim()) { try { take(JSON.parse(l) as AssistEvent); } catch { /* a torn line: the next read completes it */ } }
        show();
      }
      if (buf.trim()) { try { take(JSON.parse(buf) as AssistEvent); } catch { /* ignore */ } }
      cur = { ...cur, content: cur.content.trim() || (cur.docs?.length ? "Your document is ready." : cur.failed ? cur.content : "I couldn't answer that — try asking another way.") };
      show();
    } catch (e) {
      if (!ac.signal.aborted) setMsgs([...next, { ...cur, content: e instanceof Error ? e.message : "I couldn't reach the server.", failed: true }]);
      else setMsgs([...next, { ...cur, content: cur.content.trim() || "Stopped." }]);
    }
    setBusy(false); stop.current = null;
  };
  const act = async (i: number, a: Act) => {
    tap(); const r = await fetch("/api/assist/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: a.kind, arg: a.arg }) }); const d = await r.json();
    setMsgs((m) => m.map((x, k) => k === i ? { ...x, actions: x.actions?.filter((y) => y !== a), fixed: r.ok ? [...(x.fixed ?? []), a.label] : x.fixed, done: d.done ?? d.error, text: d.text ?? x.text } : x));
    if (d.go) { setOpen(false); router.push(d.go); } notice();
  };
  const pdf = async (d: AssistDoc) => { const { tablesPdf } = await import("@/lib/tablePdf"); return new Uint8Array(await tablesPdf(d.title, d.subtitle, d.tables, { summary: d.summary })); };
  const save = async (d: AssistDoc) => { tap(); setSaving(d.file); try { const { download } = await import("@/lib/xlsx"); download(d.file, await pdf(d), "application/pdf"); } finally { setSaving(null); } };
  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "a.pdf", { type: "application/pdf" })] });
  const share = async (d: AssistDoc) => { tap(); setSaving(d.file); try { const f = new File([(await pdf(d)).slice().buffer], d.file, { type: "application/pdf" }); await navigator.share({ files: [f], title: d.title }); } catch { /* the person closed the share sheet */ } finally { setSaving(null); } };
  const listen = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition }); const Ctor = SR.SpeechRecognition ?? SR.webkitSpeechRecognition; if (!Ctor) return;
    if (listening) { rec.current?.stop(); setListening(false); return; }
    const r = new Ctor(); r.lang = "en-IN"; r.interimResults = true; rec.current = r; setListening(true); tap();
    r.onresult = (e: SpeechRecognitionEvent) => { const t = Array.from({ length: e.results.length }, (_, k) => e.results[k][0].transcript).join(""); setQ(t); if (e.results[e.results.length - 1].isFinal) { setListening(false); ask(t); } };
    r.onend = () => setListening(false); r.onerror = () => setListening(false); r.start();
  };
  const screen = SCREEN[section] ?? "DineFlow"; const suggest = SUGGEST[section] ?? SUGGEST.dashboard; const canListen = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const last = msgs.length - 1;

  return (
    <>
      <motion.button onClick={() => { tap(); setOpen(true); }} aria-label={`Open Assist (⌘J)${urgent.length ? ` · ${urgent.length} things need you` : ""}`} title={urgent[0]?.text ?? "Assist · ⌘J"}
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: .4 }} whileTap={{ scale: .92 }}
        data-assist className={cn("fixed z-40 right-4 md:right-6 bottom-[calc(var(--tabbar)+12px)] md:bottom-6 h-14 w-14 rounded-full grid place-items-center bg-[#0a0a0d]", state === "alert" ? "shadow-[0_0_0_1px_rgb(255_255_255/.08),0_16px_40px_-12px_rgb(0_0_0/.9),0_0_0_6px_rgb(255_69_58/.14)]" : "shadow-[0_0_0_1px_rgb(255_255_255/.08),0_16px_40px_-12px_rgb(0_0_0/.9),0_0_0_6px_rgb(76_217_100/.08)]", open && "opacity-0 pointer-events-none")}>
        <AssistMark size={32} state={state} />
        {urgent.length > 0 && unseen && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-[#ff453a] text-white text-[11px] font-display grid place-items-center ring-2 ring-[#0a0a0d]">{urgent.length}</span>}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="cursor-pointer fixed inset-0 z-40 bg-black/40 md:bg-transparent md:pointer-events-none" />
            <motion.aside role="dialog" aria-label={`Assist on ${screen}`} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 32 }}
              data-assist-panel className="fixed z-50 inset-x-2 bottom-2 md:inset-auto md:right-6 md:bottom-6 md:top-6 md:w-[440px] flex flex-col max-h-[88dvh] md:max-h-none rounded-[28px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[0_40px_100px_-30px_rgb(0_0_0/.9),0_0_0_1px_rgb(255_255_255/.04)]">
              <header className="flex items-center gap-3 px-4 pt-4 pb-3">
                <AssistMark size={30} state={busy ? "thinking" : "idle"} />
                <div className="flex-1 min-w-0"><div className="font-display text-lg leading-none tracking-wide">Assist</div><div className="text-[12px] text-[var(--color-label-2)] mt-1 truncate">{busy ? "Thinking it through…" : <>Reading <b className="text-[var(--color-label)]">{screen}</b> and the whole house</>}</div></div>
                {busy && <button onClick={() => stop.current?.abort()} className="h-9 px-3 rounded-full text-[13px] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" data-assist-stop>Stop</button>}
                {!busy && msgs.length > 0 && <button onClick={() => setMsgs([])} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--color-fill)]" aria-label="Start over"><RotateCcw size={15} /></button>}
                <button onClick={() => setOpen(false)} className="h-9 w-9 grid place-items-center rounded-full hover:bg-[var(--color-fill)]" aria-label="Close"><X size={17} /></button>
              </header>
              <div className={busy ? "assist-scan" : "hairline"} />
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {msgs.length === 0 && (<>
                  <div className="grid grid-cols-2 gap-2" data-assist-tools>
                    <button onClick={() => ask(HEALTH)} data-assist-health className="min-w-0 text-left rounded-2xl p-3 bg-[var(--color-fill)] hover:brightness-110 transition">
                      <span className="h-9 w-9 rounded-xl grid place-items-center bg-[color-mix(in_srgb,var(--color-tint)_18%,transparent)] text-[var(--color-tint)]"><Stethoscope size={18} /></span>
                      <span className="block mt-2 text-[14px] font-semibold leading-tight">Check for problems</span><span className="block text-[12px] text-[var(--color-label-2)] leading-snug mt-0.5">What&apos;s wrong, why, and the fix</span>
                    </button>
                    <button onClick={() => { tap(); setDocPick((v) => !v); }} data-assist-doc aria-expanded={docPick} className={cn("min-w-0 text-left rounded-2xl p-3 bg-[var(--color-fill)] hover:brightness-110 transition", docPick && "ring-2 ring-[var(--color-tint)]")}>
                      <span className="h-9 w-9 rounded-xl grid place-items-center bg-[color-mix(in_srgb,var(--color-blue)_18%,transparent)] text-[var(--color-blue)]"><FileText size={18} /></span>
                      <span className="block mt-2 text-[14px] font-semibold leading-tight">Make a PDF</span><span className="block text-[12px] text-[var(--color-label-2)] leading-snug mt-0.5">A document to download</span>
                    </button>
                  </div>
                  {docPick && <div className="rounded-2xl border border-[var(--color-separator)] p-3" data-assist-doc-topics>
                    <p className="text-[12px] text-[var(--color-label-2)] mb-2">A PDF of this month&apos;s…</p>
                    <div className="flex flex-wrap gap-1.5">
                      {topics.length > 1 && <button onClick={() => ask("Make a complete PDF report of this month — every section I can see.")} className="h-9 px-3 rounded-full text-[13px] font-semibold bg-[var(--color-tint)] text-[var(--color-on-tint)]">Everything</button>}
                      {topics.map((t) => <button key={t.key} data-topic={t.key} onClick={() => ask(`Make a PDF of this month's ${t.label.toLowerCase()} with full details.`)} className="h-9 px-3 rounded-full text-[13px] bg-[var(--color-fill)] hover:brightness-110">{t.label}</button>)}
                      {!topics.length && <span className="text-[13px] text-[var(--color-label-2)]">Try &ldquo;PDF of last month&apos;s sales&rdquo;.</span>}
                    </div>
                  </div>}
                  {ins.length > 0 && <div className="space-y-2">
                    <p className="text-[12px] text-[var(--color-label-2)] font-display tracking-wide">Right now</p>
                    {ins.map((i) => <div key={i.text} className={cn("rounded-2xl px-3.5 py-3 text-[14px] leading-snug flex items-start gap-2", TONE[i.tone])}>
                      <span className="flex-1 text-[var(--color-label)]">{i.text}</span>
                      {i.go && i.go !== path && <button onClick={() => { setOpen(false); router.push(i.go!); }} className="shrink-0 h-7 w-7 rounded-full grid place-items-center bg-[var(--color-bg-2)]/60" aria-label="Go"><ChevronRight size={15} /></button>}
                    </div>)}
                    {ins.find((i) => i.action) && <button onClick={() => { const a = ins.find((i) => i.action)!.action!; setMsgs([{ role: "user", content: a.label }, { role: "assistant", content: "Ready when you are.", actions: [{ kind: a.kind, label: a.label, arg: String(a.args.id ?? "") }] }]); }} className="btn btn-tinted !h-10 w-full">{ins.find((i) => i.action)!.action!.label}</button>}
                  </div>}
                  <div className="space-y-2">
                    <p className="text-[12px] text-[var(--color-label-2)] font-display tracking-wide">Worth asking here</p>
                    {suggest.map((s) => <button key={s} onClick={() => ask(s)} className="block w-full text-left rounded-2xl border border-[var(--color-separator)] px-4 py-3 text-[14px] hover:bg-[var(--color-fill)] transition">{s}</button>)}
                  </div>
                  <p className="flex items-start gap-2 text-[12px] leading-snug text-[var(--color-label-3)] px-1" data-assist-privacy><Lock size={13} className="shrink-0 mt-0.5" />Private: only your screens — never passwords or keys.</p>
                </>)}
                {msgs.map((m, i) => (
                  <div key={i} className={cn(m.role === "user" ? "max-w-[88%] ml-auto" : "max-w-full")} data-assist-msg={m.role}>
                    {m.role === "assistant" && (m.think || m.steps?.length) ? (
                      <div className="mb-1.5 px-1" data-assist-trace>
                        {busy && i === last && !m.content && m.think
                          ? <p className="assist-thought text-[12.5px] italic text-[var(--color-label-3)] line-clamp-2 flex gap-1.5"><Sparkles size={13} className="shrink-0 mt-0.5 text-[var(--color-tint)]" /><span className="min-w-0">{m.think.slice(-220)}</span></p>
                          : m.think ? <button onClick={() => setUnfold(unfold === i ? null : i)} className="flex items-center gap-1 text-[12px] text-[var(--color-label-3)] hover:text-[var(--color-label-2)]" aria-expanded={unfold === i}><Sparkles size={12} />How I worked it out<ChevronDown size={13} className={cn("transition", unfold === i && "rotate-180")} /></button> : null}
                        {unfold === i && m.think && <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--color-label-2)] whitespace-pre-wrap border-l-2 border-[var(--color-separator)] pl-3">{m.think}</p>}
                        {m.steps?.length ? <div className="flex flex-wrap gap-1.5 mt-1.5">{m.steps.map((s, k) => {
                          const live = busy && i === last && k === m.steps!.length - 1 && !m.content;
                          return <span key={k} data-assist-step className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] bg-[var(--color-fill)] text-[var(--color-label-2)] max-w-full">{live ? <Loader size="xs" /> : <CircleCheck size={13} className="text-[var(--color-green)] shrink-0" />}<span className="truncate">{s}</span></span>;
                        })}</div> : null}
                      </div>
                    ) : null}
                    <div className={cn("rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap min-h-[38px] break-words", m.role === "user" ? "bg-[var(--color-label)] text-[var(--color-on-label)] rounded-br-md" : m.failed ? "bg-[var(--color-red-2)] rounded-bl-md" : "bg-[var(--color-fill)] rounded-bl-md")}>{m.content || (busy && i === last ? <Loader size="xs" className="!-my-0.5" /> : "")}</div>
                    {m.findings?.length ? <div className="mt-2 space-y-2" data-assist-findings>{m.findings.map((f, k) => (
                      <div key={k} data-finding={f.level} className="rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-3)] p-3.5">
                        <div className="flex items-center gap-2 text-[11px] font-display tracking-wider uppercase">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: LEVEL[f.level][1] }} />
                          <span style={{ color: LEVEL[f.level][1] }}>{LEVEL[f.level][0]}</span><span className="text-[var(--color-label-3)]">·</span><span className="text-[var(--color-label-2)] truncate">{f.area}</span>
                        </div>
                        <p className="mt-1.5 text-[14px] font-semibold leading-snug break-words">{f.what}</p>
                        <dl className="mt-2 space-y-1.5 text-[13px] leading-snug">
                          <div className="flex gap-2.5"><dt className="w-8 shrink-0 text-[var(--color-label-3)]">Why</dt><dd className="min-w-0 text-[var(--color-label-2)]">{f.cause}</dd></div>
                          <div className="flex gap-2.5"><dt className="w-8 shrink-0 text-[var(--color-tint)] font-semibold">Fix</dt><dd className="min-w-0">{f.fix}</dd></div>
                        </dl>
                        {(f.action && !m.fixed?.includes(f.action.label)) || f.go ? <div className="flex flex-wrap gap-2 mt-3">
                          {f.action && !m.fixed?.includes(f.action.label) && <button onClick={() => act(i, f.action!)} data-assist-action={f.action.kind} className="btn btn-filled !h-10 max-w-full"><Check size={15} /> <span className="truncate">{f.action.label}</span></button>}
                          {f.go && f.go !== path && <button onClick={() => { setOpen(false); router.push(f.go!); }} data-assist-go={f.go} className="btn btn-tinted !h-10">Open {SCREEN[f.go.slice(1).split("/")[0]] ?? f.area} <ChevronRight size={15} /></button>}
                        </div> : null}
                        {f.action && m.fixed?.includes(f.action.label) && <div className="mt-2 text-[13px] text-[var(--color-green)] flex items-center gap-1.5"><CircleCheck size={14} />Fixed</div>}
                      </div>
                    ))}</div> : null}
                    {m.docs?.map((d) => (
                      <div key={d.file} data-assist-pdf className="mt-2 rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-3)] p-3">
                        <div className="flex items-start gap-3">
                          <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-[var(--color-red-2)] text-[var(--color-red)] text-[10px] font-display tracking-wider flex-col leading-none"><FileText size={18} /><span className="mt-0.5">PDF</span></span>
                          <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold leading-tight line-clamp-2">{d.title}</div><div className="text-[12px] text-[var(--color-label-2)] mt-0.5 line-clamp-2">{d.subtitle.split("  ·  ").slice(0, 2).join(" · ")}</div><div className="text-[12px] text-[var(--color-label-3)] mt-0.5">{d.tables.length} tables · {d.tables.reduce((t, x) => t + x.rows.length, 0).toLocaleString("en-IN")} rows</div></div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => save(d)} disabled={saving === d.file} data-assist-download className="btn btn-filled !h-11 flex-1 min-w-0">{saving === d.file ? <Loader size="xs" /> : <Download size={16} />} Download PDF</button>
                          {canShare && <button onClick={() => share(d)} disabled={saving === d.file} className="btn btn-tinted !h-11 !w-11 !px-0 shrink-0" aria-label="Share PDF"><Share2 size={16} /></button>}
                        </div>
                      </div>
                    ))}
                    {m.actions?.length ? <div className="flex flex-wrap gap-2 mt-2">{m.actions.map((a, k) => <button key={k} onClick={() => act(i, a)} data-assist-action={a.kind} className={cn("btn !h-10 max-w-full", k === 0 ? "btn-filled" : "btn-tinted")}>{a.kind === "open" ? <ChevronRight size={15} /> : <Check size={15} />} <span className="truncate">{a.label}</span></button>)}</div> : null}
                    {m.done && <div className="text-[13px] text-[var(--color-label-2)] mt-2 px-1">{m.done}</div>}
                    {m.text && <div className="mt-2 rounded-2xl bg-[var(--color-bg-3)] p-3 text-[13px] whitespace-pre-wrap relative">{m.text}<button onClick={() => { copyText(m.text!); setCopied(i); }} className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-[var(--color-bg-2)]" aria-label="Copy">{copied === i ? <Check size={14} /> : <Copy size={14} />}</button></div>}
                  </div>
                ))}
                <div ref={end} />
              </div>
              <div className="p-3 pt-0">
                <div className={cn("flex items-end gap-2 rounded-2xl bg-[var(--color-bg-3)] p-2 pl-4 min-h-[56px] focus-within:ring-2 focus-within:ring-[rgb(76_217_100/.5)]", listening && "ring-2 ring-[rgb(255_69_58/.6)]")}>
                  {/* flex-1 min-w-0: without it a textarea takes its width from `cols`, which is 20
                      characters — the field ended up narrower than the row, and the placeholder
                      wrapped onto a second line that a one-row box then cut in half. */}
                  <textarea ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} rows={1} placeholder={listening ? "Listening…" : "Ask, or ask for a PDF…"} className="assist-input resize-none text-[15px] leading-6 flex-1 min-w-0 max-h-32" />
                  {canListen && <button onClick={listen} aria-label={listening ? "Stop listening" : "Speak"} className={cn("h-10 w-10 shrink-0 rounded-full grid place-items-center transition", listening ? "bg-[#ff453a] text-white" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}>{listening ? <MicOff size={17} /> : <Mic size={17} />}</button>}
                  <button onClick={() => ask(q)} disabled={!q.trim() || busy} aria-label="Send" className="h-10 w-10 shrink-0 rounded-full grid place-items-center bg-[#4cd964] text-[#06120a] disabled:opacity-30 transition"><ArrowUp size={18} strokeWidth={2.5} /></button>
                </div>
                <div className="text-[11px] text-[var(--color-label-3)] mt-2 px-1">Does things only after you tap · ⌘J anywhere</div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
