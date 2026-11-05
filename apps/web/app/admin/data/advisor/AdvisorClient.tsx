"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Loader2, Check, AlertTriangle, XCircle, ChevronRight, Bot } from "lucide-react";
import { Note, Panel } from "../bits";
import s from "../Data.module.css";

type Finding = { level: "ok" | "warn" | "bad"; key: string; title: string; detail: string; fix?: string; href?: string };
type Reply = { answer: string; steps: string[]; links: { label: string; href: string }[]; source: "model" | "rules" };
type Turn = { q: string; a?: Reply; error?: string };
const ICON = { ok: Check, warn: AlertTriangle, bad: XCircle };

export function AdvisorClient({ findings: first, suggested, ai, at }: { findings: Finding[]; suggested: string[]; ai: boolean; at: string }) {
  const [findings, setFindings] = useState(first); const [turns, setTurns] = useState<Turn[]>([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const ask = async (question: string) => {
    const text = question.trim(); if (!text || busy) return;
    setBusy(true); setQ(""); setTurns((t) => [...t, { q: text }]);
    let r: { findings?: Finding[]; reply?: Reply; error?: string };
    try { const res = await fetch("/api/admin/data/advisor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: text }) }); r = await res.json(); if (!res.ok && !r.error) r.error = `The server answered ${res.status}.`; }
    catch { r = { error: "No connection — try again." }; }
    setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a: r.reply, error: r.error } : x)));
    if (r.findings) setFindings(r.findings); setBusy(false);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
  };
  const bad = findings.filter((f) => f.level === "bad").length, warn = findings.filter((f) => f.level === "warn").length;
  return (
    <>
      <Panel title="What the advisor sees" sub={`Checked just now · ${bad ? `${bad} serious · ` : ""}${warn} to look at · ${findings.length - bad - warn} fine`} data-advisor-findings
        right={<span className={s.chip} data-tone={ai ? "tint" : undefined}><Bot size={11} aria-hidden /> {ai ? "answers by Claude" : "answers from the rules"}</span>}>
        <div className="px-[18px] pb-[18px]"><div className={s.findings}>
          {findings.map((f) => { const I = ICON[f.level]; return (
            <div key={f.key} className={s.finding} data-level={f.level} data-finding={f.key}>
              <b><I size={15} aria-hidden />{f.title}</b><p>{f.detail}</p>{f.fix && <p><b className="font-semibold text-[var(--color-label)]">Do:</b> {f.fix}</p>}
              {f.href && <Link href={f.href} className="inline-flex items-center gap-1">Open <ChevronRight size={12} aria-hidden /></Link>}
            </div>); })}
        </div></div>
      </Panel>

      <Panel title="Ask" sub={ai ? "Plain questions about your data, backups and servers. The advisor reads; it never changes anything." : "Answers come from the checks above. With an ANTHROPIC_API_KEY on the server, Claude answers in full."} data-advisor-ask>
        <div className={s.pad}>
          <div className={s.suggest} data-advisor-suggest>{suggested.map((x) => <button key={x} type="button" onClick={() => ask(x)} disabled={busy}>{x}</button>)}</div>
          {turns.length > 0 && <div className={s.chat} data-advisor-chat>
            {turns.map((t, i) => (
              <div key={i} className="grid gap-2">
                <div className={s.msgQ}>{t.q}</div>
                {t.a ? <div className={s.msgA} data-advisor-answer={t.a.source}>
                  <p>{t.a.answer}</p>
                  {t.a.steps.length > 0 && <ol>{t.a.steps.map((st, j) => <li key={j}>{st}</li>)}</ol>}
                  {t.a.links.length > 0 && <div className={s.msgLinks}>{t.a.links.map((l) => <Link key={l.href + l.label} href={l.href} className={s.key}>{l.label} <ChevronRight size={13} aria-hidden /></Link>)}</div>}
                  <div className="text-[11px] text-[var(--color-label-3)]">{t.a.source === "model" ? "Answered by Claude from the facts above" : "Answered from the checks above"} · {new Date(at).toDateString()}</div>
                </div> : t.error ? <Note tone="bad">{t.error}</Note> : <div className={s.msgA}><Loader2 size={16} className="animate-spin" aria-hidden /> Reading the data…</div>}
              </div>))}
            <div ref={end} />
          </div>}
          <form className={s.ask} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about the data — safety, space, servers, what to do" maxLength={400} data-advisor-input />
            <button type="submit" className="btn btn-filled !h-11 !px-4" disabled={!q.trim() || busy} data-advisor-send>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}<span className="max-[480px]:hidden"> Ask</span></button>
          </form>
          <Note><Sparkles size={14} className="inline mr-1" aria-hidden />The advisor only reads. Every step it suggests is a screen where you press the button yourself.</Note>
        </div>
      </Panel>
    </>
  );
}
