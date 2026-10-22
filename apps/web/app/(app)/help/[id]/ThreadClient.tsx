"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, X, Send, Loader2, CheckCircle2, RotateCcw, ShieldCheck, Star, CircleCheck, Sparkles } from "lucide-react";
import { Button, Card, Switch, cn } from "@/components/ui";
import { kindOf, ticketNo, stamp, when, topicLabel, daysLeft, eventText, CONTACT, SHOT_MAX } from "@/lib/support";
import { kindIcon } from "@/components/support/icons";
import { StatusChip, PriorityChip } from "@/components/support/chips";
import { uploadShots } from "@/components/support/shots";
import { replyRequest, attachShots, setRequestStatus, setRequestAccess, rateRequest, markSeen } from "../actions";

export type Ticket = { id: string; ticket_no: number; restaurant_id: string; kind: string; topic: string | null; priority: string; status: string; subject: string; allow_access: boolean; due_by: string | null; rating: number | null; rating_note: string | null; raised_by: string | null; raised_name: string | null; raised_role: string | null; created_at: string; last_message_at: string; last_message_side: string; user_seen_at: string; resolved_at: string | null; context: Record<string, unknown> };
export type Msg = { id: string; side: "user" | "support"; event: string | null; body: string; author: string | null; author_name: string | null; attachments: string[]; created_at: string };

/* the four steps a request goes through, as the property reads them */
const STEPS = [{ key: "open", label: "Received" }, { key: "in_progress", label: "Being worked on" }, { key: "waiting", label: "Waiting for you" }, { key: "resolved", label: "Sorted" }] as const;
const stepOf = (s: string) => (s === "closed" ? 3 : Math.max(0, STEPS.findIndex((x) => x.key === s)));

export function ThreadClient({ ticket: t, messages, urls, me, role, sent }: { ticket: Ticket; messages: Msg[]; urls: Record<string, string>; me: string; role: string; sent: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [body, setBody] = useState(""); const [files, setFiles] = useState<File[]>([]); const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null); const [stage, setStage] = useState<string | null>(null);
  const [stars, setStars] = useState(t.rating ?? 0); const [note, setNote] = useState(t.rating_note ?? ""); const [rated, setRated] = useState(false);
  const pick = useRef<HTMLInputElement>(null); const end = useRef<HTMLDivElement>(null);
  const mine = t.raised_by === me; const manage = mine || role === "owner" || role === "manager";
  const closed = t.status === "closed", done = t.status === "resolved" || closed;
  const k = kindOf(t.kind); const Icon = kindIcon(t.kind); const left = daysLeft(t.due_by);

  // opening it is reading it: the badge on Help & support clears
  useEffect(() => { if (mine && t.last_message_side === "support" && new Date(t.last_message_at) > new Date(t.user_seen_at)) void markSeen(t.id); }, [mine, t.id, t.last_message_side, t.last_message_at, t.user_seen_at]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    const room = SHOT_MAX - files.length; if (!list || room <= 0) return;
    const fresh = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    setFiles((f) => [...f, ...fresh]); setPreviews((p) => [...p, ...fresh.map((f) => URL.createObjectURL(f))]);
  };
  const drop = (i: number) => { URL.revokeObjectURL(previews[i]); setFiles((f) => f.filter((_, j) => j !== i)); setPreviews((p) => p.filter((_, j) => j !== i)); };

  const reply = () => start(async () => {
    setErr(null); setStage("Sending…");
    const r = await replyRequest(t.id, body);
    if ("error" in r) { setErr(r.error ?? "It did not go through."); setStage(null); return; }
    if (files.length) { setStage("Uploading…"); const up = await uploadShots(t.restaurant_id, t.id, files); if (up.paths.length) await attachShots(t.id, r.message_id, up.paths); }
    previews.forEach((u) => URL.revokeObjectURL(u)); setFiles([]); setPreviews([]); setBody(""); setStage(null);
    router.refresh(); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 400);
  });
  const act = (fn: () => Promise<{ ok?: true; error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); else router.refresh(); });

  return (
    <div className="space-y-5" data-thread={t.ticket_no}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-label-3)] num">{ticketNo(t.ticket_no)} · Help & support</div>
          <h1 className="text-[24px] sm:text-[30px] font-display leading-[1.25] pb-0.5 truncate" title={t.subject}>{t.subject}</h1>
        </div>
      </div>

      {sent && (
        <div className="rounded-2xl p-4 flex items-start gap-3 bg-[var(--color-green-2)]" data-sent>
          <CircleCheck size={20} className="shrink-0 text-[var(--color-tint)] mt-px" />
          <div className="text-[13.5px] leading-snug"><b>Sent — {ticketNo(t.ticket_no)}.</b> Our team has it. Replies show below{CONTACT.hours ? ` (${CONTACT.hours})` : ""}.{t.kind === "privacy" && <> A privacy & consent request is answered within {CONTACT.grievanceDays} days.</>}</div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] items-start">
        <div className="space-y-4 min-w-0">
          {/* where it is: four steps */}
          <Card className="!p-4" data-steps>
            <ol className="grid grid-cols-4 gap-1.5">
              {STEPS.map((s, i) => { const on = i <= stepOf(t.status); return (
                <li key={s.key} className="min-w-0">
                  <div className={cn("h-1.5 rounded-full", on ? "bg-[var(--color-tint)]" : "bg-[var(--color-fill-2)]")} />
                  <div className={cn("mt-1.5 text-[11.5px] leading-tight", i === stepOf(t.status) ? "font-semibold text-[var(--color-label)]" : on ? "text-[var(--color-label-2)]" : "text-[var(--color-label-3)]")}>{s.label}</div>
                </li>); })}
            </ol>
            {t.status === "waiting" && <p className="mt-3 text-[13px] rounded-xl bg-[var(--color-fill)] px-3 py-2.5" data-waiting><b>DineFlow is waiting for your answer.</b> Reply below and it goes straight back to them.</p>}
          </Card>

          {/* the thread */}
          <div className="space-y-3" data-messages>
            {messages.map((m) => {
              if (m.event) return (
                <div key={m.id} className="flex items-center gap-2 justify-center text-[11.5px] text-[var(--color-label-3)]" data-event={m.event} suppressHydrationWarning>
                  <span className="h-px w-8 bg-[var(--color-separator)]" />{eventText(m.event, m.body)} · {stamp(m.created_at)}<span className="h-px w-8 bg-[var(--color-separator)]" />
                </div>
              );
              const ours = m.side === "user"; const self = m.author === me;
              return (
                <div key={m.id} className={cn("flex gap-2.5", ours ? "flex-row-reverse" : "")} data-message={m.side}>
                  <span className={cn("h-9 w-9 shrink-0 rounded-full grid place-items-center text-[14px] font-display", ours ? "bg-[var(--color-fill-2)]" : "bg-[var(--color-tint)] text-[var(--color-on-tint)]")} aria-hidden>
                    {ours ? (m.author_name ?? "?").slice(0, 1) : <Sparkles size={15} />}
                  </span>
                  <div className={cn("min-w-0 max-w-[min(34rem,85%)] rounded-2xl px-3.5 py-2.5", ours ? "bg-[color-mix(in_srgb,var(--color-tint)_12%,var(--color-bg-2))] rounded-tr-md" : "bg-[var(--color-bg-2)] border border-[var(--color-separator)] rounded-tl-md")}>
                    <div className="text-[11.5px] font-semibold text-[var(--color-label-2)] flex gap-2" suppressHydrationWarning>
                      <span className="truncate">{ours ? (self ? "You" : m.author_name ?? "Your team") : "DineFlow support"}</span><span className="font-normal text-[var(--color-label-3)] shrink-0">{when(m.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                    {m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((p, i) => urls[p] ? (
                          <a key={p} href={urls[p]} target="_blank" rel="noreferrer" className="block h-24 w-24 rounded-xl overflow-hidden ring-1 ring-[var(--color-separator)]" data-shot>
                            {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind a signed link for the hour */}
                            <img src={urls[p]} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                          </a>
                        ) : null)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={end} />
          </div>

          {/* answer back */}
          {closed ? (
            <p className="rounded-2xl bg-[var(--color-fill)] p-4 text-[13px]" data-closed>This request is closed. If it comes back, <Link href={`/help?kind=${t.kind}`} className="underline font-semibold">raise a new one</Link> and mention {ticketNo(t.ticket_no)}.</p>
          ) : manage ? (
            <Card className="space-y-3" data-composer>
              <label htmlFor="sup-reply" className="!mb-0">{done ? "Still not right? Reply and it opens again" : "Reply"}</label>
              <textarea id="sup-reply" rows={3} value={body} onChange={(e) => setBody(e.target.value.slice(0, 5000))} placeholder="Write to the DineFlow team…" />
              <div className="flex flex-wrap items-center gap-2">
                {previews.map((p, i) => (
                  <div key={p} className="relative h-14 w-14 rounded-xl overflow-hidden ring-1 ring-[var(--color-separator)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) */}
                    <img src={p} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => drop(i)} aria-label={`Remove screenshot ${i + 1}`} className="absolute top-0.5 right-0.5 h-6 w-6 !min-h-0 !min-w-0 rounded-full bg-black/65 text-white grid place-items-center"><X size={12} /></button>
                  </div>
                ))}
                {files.length < SHOT_MAX && <Button variant="outline" onClick={() => pick.current?.click()}><ImagePlus size={16} /> Screenshot</Button>}
                <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple hidden style={{ display: "none" }} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
                <Button className="ml-auto" disabled={pending || !body.trim()} onClick={reply} data-reply>{pending && stage ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {pending && stage ? stage : "Send"}</Button>
              </div>
            </Card>
          ) : null}
          {err && <p className="rounded-xl bg-[var(--color-red-2)] px-3.5 py-2.5 text-[13px] text-[var(--color-red)]" role="alert">{err}</p>}
        </div>

        {/* the request, and what the person can do with it */}
        <aside className="space-y-4 min-w-0 lg:sticky lg:top-24" data-side>
          <Card className="space-y-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-10 w-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, var(${k.tone}) 16%, transparent)`, color: `var(${k.tone})` }}><Icon size={17} /></span>
              <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold truncate">{k.label}{t.topic ? ` · ${topicLabel(t.topic)}` : ""}</div><div className="text-[12px] text-[var(--color-label-2)] num" suppressHydrationWarning>{stamp(t.created_at)}</div></div>
            </div>
            <div className="flex flex-wrap gap-1.5"><StatusChip status={t.status} /><PriorityChip priority={t.priority} /></div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
              <dt className="text-[var(--color-label-2)]">Raised by</dt><dd className="truncate">{mine ? "You" : t.raised_name ?? "—"}</dd>
              {t.due_by && <><dt className="text-[var(--color-label-2)]">Answer due</dt><dd className={cn(left !== null && left <= 3 && !done && "text-[var(--color-orange)] font-semibold")} suppressHydrationWarning>{stamp(t.due_by)}{left !== null && !done ? ` · ${left >= 0 ? `${left} day${left === 1 ? "" : "s"} left` : "overdue"}` : ""}</dd></>}
              {typeof t.context?.page === "string" && <><dt className="text-[var(--color-label-2)]">Page</dt><dd className="truncate num">{t.context.page as string}</dd></>}
            </dl>
            {manage && !closed && (done
              ? <Button variant="outline" className="w-full" disabled={pending} onClick={() => act(() => setRequestStatus(t.id, "open"))} data-reopen><RotateCcw size={16} /> Open it again</Button>
              : <Button variant="outline" className="w-full" disabled={pending} onClick={() => act(() => setRequestStatus(t.id, "resolved"))} data-sorted><CheckCircle2 size={16} /> This is sorted</Button>)}
          </Card>

          {manage && !closed && (
            <label className="feather flex items-start gap-3 p-4 cursor-pointer" data-access>
              <ShieldCheck size={18} className="shrink-0 mt-0.5 text-[var(--color-tint)]" />
              <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold leading-snug">DineFlow may open the property</span><span className="block text-[12px] text-[var(--color-label-2)] mt-0.5 leading-snug">{t.allow_access ? "Allowed. Everything they do is logged." : "Not allowed. Turn on if they need to look."}</span></span>
              <Switch on={t.allow_access} onChange={(v) => act(() => setRequestAccess(t.id, v))} name="DineFlow may open the property for this request" />
            </label>
          )}

          {mine && done && (
            <Card className="space-y-3" data-rating>
              <div className="text-[14px] font-semibold">{t.rating && !rated ? "Your rating" : "How did we do?"}</div>
              <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => setStars(n)} className="h-11 w-11 grid place-items-center rounded-xl hover:bg-[var(--color-fill)]">
                    <Star size={24} className={n <= stars ? "text-[var(--color-orange)] fill-current" : "text-[var(--color-label-3)]"} />
                  </button>
                ))}
              </div>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} placeholder="Anything to add? (optional)" />
              <Button className="w-full" disabled={pending || !stars} onClick={() => act(async () => { const r = await rateRequest(t.id, stars, note); if (r.ok) setRated(true); return r; })} data-rate>{rated ? "Thank you" : "Save rating"}</Button>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
