"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send, Loader2, ImagePlus, X, LogIn, Building2, Mail, Phone, MessageCircle, StickyNote, ShieldCheck, ShieldAlert, Star, Monitor, ExternalLink } from "lucide-react";
import { Button, Segmented, cn } from "@/components/ui";
import { kindOf, ticketNo, stamp, when, topicLabel, daysLeft, eventText, STATUS, PRIORITIES, SHOT_MAX, type Status } from "@/lib/support";
import { StatusChip, PriorityChip } from "@/components/support/chips";
import { uploadShots } from "@/components/support/shots";
import { answer, attach, setTicket, seen, dropFile } from "../actions";

type T = { id: string; ticket_no: number; restaurant_id: string; kind: string; topic: string | null; priority: string; status: string; subject: string; allow_access: boolean; context: Record<string, unknown>;
  due_by: string | null; rating: number | null; rating_note: string | null; created_at: string; first_response_at: string | null; resolved_at: string | null; last_message_side: string; last_message_at: string; support_seen_at: string | null; raised_name: string | null; raised_role: string | null };
type M = { id: string; side: "user" | "support"; internal: boolean; event: string | null; body: string; author_name: string | null; attachments: string[]; created_at: string };
export type Full = { ticket: T; property: { id: string; name: string; type: string; phone: string | null; district: string | null; pincode: string | null } | null;
  person: { name: string | null; role: string | null; email: string | null; phone: string | null; active: boolean | null } | null; messages: M[]; others: { id: string; no: number; subject: string; status: string; created_at: string }[] };

const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", supervisor: "Supervisor", cashier: "Cashier", waiter: "Waiter", chef: "Chef", housekeeping: "Housekeeping", frontdesk: "Front desk", master: "Master control" };
/* replies a support person reaches for most — a tap puts the words in the box, ready to edit */
const QUICK = [
  "Thank you — we are looking into it now and will update you here.",
  "Could you send a screenshot of the screen as it looks now?",
  "This is fixed. Please pull down to refresh (or close and reopen the app) and try again.",
  "We have noted this as a feature request — thank you for the idea.",
];
const dur = (a: string, b: string) => { const m = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`; };
const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").replace(/^0+/, "");

export function TicketDesk({ full, urls }: { full: Full; urls: Record<string, string> }) {
  const { ticket: t, property: p, person, messages, others } = full;
  const router = useRouter(); const [pending, start] = useTransition();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState(""); const [after, setAfter] = useState<string>(t.status === "closed" ? "closed" : "waiting");
  const [files, setFiles] = useState<File[]>([]); const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null); const [stage, setStage] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const k = kindOf(t.kind); const left = t.kind === "privacy" ? daysLeft(t.due_by) : null;
  const done = t.status === "resolved" || t.status === "closed";
  const ctx = t.context ?? {};

  // opening it is reading it: it leaves the Support badge
  useEffect(() => { if (t.last_message_side === "user" && (!t.support_seen_at || new Date(t.last_message_at) > new Date(t.support_seen_at))) void seen(t.id).then(() => router.refresh()); }, [t.id, t.last_message_side, t.last_message_at, t.support_seen_at, router]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    const room = SHOT_MAX - files.length; if (!list || room <= 0) return;
    const fresh = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    setFiles((f) => [...f, ...fresh]); setPreviews((x) => [...x, ...fresh.map((f) => URL.createObjectURL(f))]);
  };
  const drop = (i: number) => { URL.revokeObjectURL(previews[i]); setFiles((f) => f.filter((_, j) => j !== i)); setPreviews((x) => x.filter((_, j) => j !== i)); };
  const send = () => start(async () => {
    setErr(null); setStage("Sending…");
    const r = await answer(t.id, body, mode === "note", mode === "reply" ? after : null);
    if ("error" in r) { setErr(r.error ?? "It did not go through."); setStage(null); return; }
    if (files.length) { setStage("Uploading…"); const up = await uploadShots(t.restaurant_id, t.id, files); if (up.paths.length) await attach(t.id, r.message_id, up.paths); }
    previews.forEach((u) => URL.revokeObjectURL(u)); setFiles([]); setPreviews([]); setBody(""); setStage(null); router.refresh();
  });
  const act = (fn: () => Promise<{ ok?: true; error?: string }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); router.refresh(); });
  const set = (status: string | null, priority: string | null) => act(() => setTicket(t.id, status, priority));

  return (
    <div className="space-y-5" data-ticket-desk={t.ticket_no}>
      <div className="flex items-start gap-3 min-w-0">
        <Link href="/admin/support" aria-label="Back to Support" className="h-11 w-11 shrink-0 rounded-2xl bg-[var(--color-fill)] grid place-items-center hover:bg-[var(--color-fill-2)] transition-colors"><ChevronLeft size={18} /></Link>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-label-3)] num">{ticketNo(t.ticket_no)} · {k.label}{t.topic ? ` · ${topicLabel(t.topic)}` : ""}</div>
          <h1 className="text-[24px] sm:text-[30px] font-display leading-tight [overflow-wrap:anywhere]">{t.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5"><StatusChip status={t.status} desk /><PriorityChip priority={t.priority} />
            {left !== null && !done && <span className={cn("h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center whitespace-nowrap", left <= 3 ? "bg-[var(--color-red-2)] text-[var(--color-red)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")} suppressHydrationWarning>{left >= 0 ? `Answer within ${left} day${left === 1 ? "" : "s"}` : "Grievance overdue"}</span>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,23rem)] items-start">
        <div className="space-y-4 min-w-0">
          <div className="space-y-3" data-desk-messages>
            {messages.map((m) => {
              if (m.event) return (
                <div key={m.id} className="flex items-center gap-2 justify-center text-[11.5px] text-[var(--color-label-3)]" data-event={m.event} suppressHydrationWarning>
                  <span className="h-px w-8 bg-[var(--color-separator)]" />{eventText(m.event, m.body, true)}{m.side === "user" ? ` — ${m.author_name ?? "the property"}` : ""} · {stamp(m.created_at)}<span className="h-px w-8 bg-[var(--color-separator)]" />
                </div>
              );
              const ours = m.side === "support";
              return (
                <div key={m.id} className={cn("flex gap-2.5", ours ? "flex-row-reverse" : "")} data-desk-message={m.internal ? "note" : m.side}>
                  <span className={cn("h-9 w-9 shrink-0 rounded-full grid place-items-center text-[14px] font-display", ours ? (m.internal ? "bg-[color-mix(in_srgb,var(--color-orange)_22%,transparent)] text-[var(--color-orange)]" : "bg-[var(--color-tint)] text-[var(--color-on-tint)]") : "bg-[var(--color-fill-2)]")} aria-hidden>
                    {m.internal ? <StickyNote size={15} /> : (m.author_name ?? "?").slice(0, 1)}
                  </span>
                  <div className={cn("min-w-0 max-w-[min(36rem,86%)] rounded-2xl px-3.5 py-2.5",
                    m.internal ? "bg-[color-mix(in_srgb,var(--color-orange)_12%,var(--color-bg-2))] border border-dashed border-[color-mix(in_srgb,var(--color-orange)_45%,transparent)] rounded-tr-md"
                      : ours ? "bg-[color-mix(in_srgb,var(--color-tint)_12%,var(--color-bg-2))] rounded-tr-md" : "bg-[var(--color-bg-2)] border border-[var(--color-separator)] rounded-tl-md")}>
                    <div className="text-[11.5px] font-semibold text-[var(--color-label-2)] flex gap-2 flex-wrap" suppressHydrationWarning>
                      <span>{m.internal ? "Internal note · only Master control sees this" : ours ? "DineFlow support" : `${m.author_name ?? "Property"}`}</span><span className="font-normal text-[var(--color-label-3)]">{stamp(m.created_at)}</span>
                    </div>
                    <p className="mt-1 text-[14px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>
                    {m.attachments?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((path, i) => urls[path] ? (
                          <div key={path} className="relative">
                            <a href={urls[path]} target="_blank" rel="noreferrer" className="block h-24 w-24 rounded-xl overflow-hidden ring-1 ring-[var(--color-separator)]" data-desk-shot>
                              {/* eslint-disable-next-line @next/next/no-img-element -- a private file behind a signed link for the hour */}
                              <img src={urls[path]} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                            </a>
                            {/* a screenshot that shows more than it should (a guest's details) can be taken off — the property is told */}
                            <button type="button" disabled={pending} aria-label={`Remove screenshot ${i + 1}`} title="Remove this screenshot" data-drop-shot
                              onClick={() => { if (confirm("Remove this screenshot? It is deleted, and the property sees that it was removed.")) act(() => dropFile(t.id, m.id, path)); }}
                              className="absolute -top-2 -right-2 h-8 w-8 !min-h-0 !min-w-0 rounded-full bg-[var(--color-bg-2)] ring-1 ring-[var(--color-separator)] shadow-sm grid place-items-center text-[var(--color-red)] hover:bg-[var(--color-red-2)]"><X size={14} /></button>
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* answer, or leave a note for Master control */}
          <div className={cn("feather p-4 space-y-3", mode === "note" && "!border-dashed !border-[color-mix(in_srgb,var(--color-orange)_50%,transparent)]")} data-desk-composer>
            <Segmented value={mode} onChange={setMode} className="w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none" options={[{ value: "reply", label: "Reply to the property" }, { value: "note", label: "Internal note" }]} />
            {mode === "reply" && (
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1" data-quick>
                {QUICK.map((q) => <button key={q} type="button" onClick={() => setBody((b) => (b ? `${b}\n${q}` : q))} className="chip shrink-0 max-w-[16rem] !justify-start"><span className="truncate">{q}</span></button>)}
              </div>
            )}
            <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value.slice(0, 5000))} aria-label={mode === "reply" ? "Reply" : "Internal note"}
              placeholder={mode === "reply" ? `Write to ${t.raised_name ?? "the property"} — they see this on Help & support` : "Only Master control sees a note — what you checked, what you found, what is next"} />
            <div className="flex flex-wrap items-center gap-2">
              {previews.map((x, i) => (
                <div key={x} className="relative h-14 w-14 rounded-xl overflow-hidden ring-1 ring-[var(--color-separator)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) */}
                  <img src={x} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => drop(i)} aria-label={`Remove screenshot ${i + 1}`} className="absolute top-0.5 right-0.5 h-6 w-6 !min-h-0 !min-w-0 rounded-full bg-black/65 text-white grid place-items-center"><X size={12} /></button>
                </div>
              ))}
              {files.length < SHOT_MAX && <Button variant="outline" onClick={() => pick.current?.click()}><ImagePlus size={16} /> Screenshot</Button>}
              <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden style={{ display: "none" }} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
              {mode === "reply" && (
                <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-label-2)] min-w-0">Then
                  <select value={after} onChange={(e) => setAfter(e.target.value)} aria-label="Status after sending" className="!h-10 !py-0 min-w-0" data-after>
                    {(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
                  </select>
                </label>
              )}
              <Button className="ml-auto" disabled={pending || !body.trim()} onClick={send} data-desk-send>{pending && stage ? <Loader2 size={16} className="animate-spin" /> : mode === "note" ? <StickyNote size={16} /> : <Send size={16} />} {pending && stage ? stage : mode === "note" ? "Save note" : "Send reply"}</Button>
            </div>
          </div>
          {err && <p className="rounded-xl bg-[var(--color-red-2)] px-3.5 py-2.5 text-[13px] text-[var(--color-red)]" role="alert">{err}</p>}
        </div>

        <aside className="space-y-4 min-w-0 lg:sticky lg:top-6" data-desk-side>
          {/* where it stands */}
          <div className="feather p-4 space-y-3">
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              <label className="space-y-1 min-w-0"><span className="text-[11.5px] font-semibold text-[var(--color-label-2)]">Status</span>
                <select value={t.status} onChange={(e) => set(e.target.value, null)} disabled={pending} data-set-status>{(Object.keys(STATUS) as Status[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select></label>
              <label className="space-y-1 min-w-0"><span className="text-[11.5px] font-semibold text-[var(--color-label-2)]">Priority</span>
                <select value={t.priority} onChange={(e) => set(null, e.target.value)} disabled={pending} data-set-priority>{PRIORITIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]" suppressHydrationWarning>
              <dt className="text-[var(--color-label-2)]">Raised</dt><dd>{stamp(t.created_at)} · {when(t.created_at)}</dd>
              <dt className="text-[var(--color-label-2)]">First reply</dt><dd>{t.first_response_at ? `after ${dur(t.created_at, t.first_response_at)}` : <span className="text-[var(--color-orange)] font-semibold">not yet</span>}</dd>
              {t.resolved_at && <><dt className="text-[var(--color-label-2)]">Resolved</dt><dd>{stamp(t.resolved_at)}</dd></>}
              {t.due_by && <><dt className="text-[var(--color-label-2)]">Answer by</dt><dd className={cn(left !== null && left <= 3 && !done && "text-[var(--color-red)] font-semibold")}>{stamp(t.due_by)} · 15-day grievance limit</dd></>}
            </dl>
            {t.rating && (
              <div className="rounded-xl bg-[var(--color-fill)] p-3" data-desk-rating>
                <div className="flex gap-0.5" aria-label={`Rated ${t.rating} of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={16} className={n <= t.rating! ? "text-[var(--color-orange)] fill-current" : "text-[var(--color-label-3)]"} />)}</div>
                {t.rating_note && <p className="mt-1.5 text-[12.5px] [overflow-wrap:anywhere]">“{t.rating_note}”</p>}
              </div>
            )}
          </div>

          {/* the property, and the way in — with the customer's consent shown first */}
          {p && (
            <div className="feather p-4 space-y-3" data-desk-property>
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-10 w-10 rounded-[12px] grid place-items-center shrink-0 bg-[var(--color-fill)]"><Building2 size={17} /></span>
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold truncate">{p.name}</div><div className="text-[12px] text-[var(--color-label-2)] capitalize truncate">{p.type}{p.district ? ` · ${p.district}` : ""}{p.pincode ? ` ${p.pincode}` : ""}</div></div>
              </div>
              <div className={cn("rounded-xl p-3 flex items-start gap-2.5 text-[12.5px] leading-snug", t.allow_access ? "bg-[var(--color-green-2)]" : "bg-[var(--color-fill)]")} data-consent-state={t.allow_access ? "allowed" : "not"}>
                {t.allow_access ? <ShieldCheck size={16} className="shrink-0 text-[var(--color-tint)] mt-px" /> : <ShieldAlert size={16} className="shrink-0 text-[var(--color-orange)] mt-px" />}
                <span>{t.allow_access ? <><b>They allowed access</b> for this request. Everything done inside is logged.</> : <><b>Access not allowed.</b> Ask in a reply before you open the property.</>}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/admin/${p.id}`} className="btn btn-gray !h-11 !text-[13px] !px-3"><ExternalLink size={15} /> Property</Link>
                <form action="/admin/open" method="post" className="contents" onSubmit={(e) => { if (!t.allow_access && !confirm(`${t.raised_name ?? "They"} did not allow access for this request. Open ${p.name} anyway?`)) e.preventDefault(); }}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className={cn("btn !h-11 !text-[13px] !px-3", t.allow_access ? "btn-filled" : "btn-gray")} data-desk-open><LogIn size={15} /> {t.allow_access ? "Open" : "Open anyway"}</button>
                </form>
              </div>
            </div>
          )}

          {/* the person, and how to reach them */}
          {person && (
            <div className="feather p-4 space-y-3" data-desk-person>
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-10 w-10 rounded-full grid place-items-center shrink-0 bg-[var(--color-fill-2)] font-display text-[16px]">{(person.name ?? "?").slice(0, 1)}</span>
                <div className="min-w-0 flex-1"><div className="text-[14px] font-semibold truncate">{person.name ?? t.raised_name ?? "—"}</div><div className="text-[12px] text-[var(--color-label-2)] truncate">{ROLE[person.role ?? t.raised_role ?? ""] ?? person.role ?? "—"}{person.active === false ? " · login switched off" : ""}</div></div>
              </div>
              <div className="grid gap-2">
                {person.email && <a href={`mailto:${person.email}?subject=${encodeURIComponent(`${ticketNo(t.ticket_no)} · ${t.subject}`)}`} className="flex items-center gap-2.5 min-h-11 px-3 rounded-xl bg-[var(--color-fill)] text-[13px] hover:bg-[var(--color-fill-2)] transition-colors min-w-0"><Mail size={15} className="shrink-0" /><span className="truncate">{person.email}</span></a>}
                {person.phone && <div className="grid grid-cols-2 gap-2">
                  <a href={`tel:${person.phone}`} className="flex items-center gap-2 min-h-11 px-3 rounded-xl bg-[var(--color-fill)] text-[13px] hover:bg-[var(--color-fill-2)] transition-colors min-w-0"><Phone size={15} className="shrink-0" /><span className="truncate num">{person.phone}</span></a>
                  <a href={`https://wa.me/${digits(person.phone).length === 10 ? `91${digits(person.phone)}` : digits(person.phone)}?text=${encodeURIComponent(`Hello ${person.name ?? ""}, this is DineFlow support about ${ticketNo(t.ticket_no)} — ${t.subject}.`)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 min-h-11 px-3 rounded-xl bg-[var(--color-fill)] text-[13px] text-[var(--color-tint)] hover:bg-[var(--color-fill-2)] transition-colors"><MessageCircle size={15} className="shrink-0" /> WhatsApp</a>
                </div>}
                {!person.email && !person.phone && <p className="text-[12.5px] text-[var(--color-label-2)]">No email or phone on this login — reply here.</p>}
              </div>
            </div>
          )}

          {/* what the app knew when it was raised */}
          <div className="feather p-4" data-desk-context>
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--color-label-2)] mb-2"><Monitor size={14} /> Where they were</div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px]">
              {([["Page", ctx.page], ["Device", ctx.device], ["Screen", ctx.screen], ["Theme", ctx.theme], ["Online", ctx.online === undefined ? null : ctx.online ? "yes" : "no — offline"], ["Language", ctx.language], ["Version", ctx.version]] as [string, unknown][])
                .filter(([, v]) => v !== null && v !== undefined && v !== "").map(([l, v]) => <div key={l} className="contents"><dt className="text-[var(--color-label-2)]">{l}</dt><dd className="truncate num">{String(v)}</dd></div>)}
            </dl>
          </div>

          {others.length > 0 && (
            <div className="feather p-4" data-desk-others>
              <div className="text-[12.5px] font-semibold text-[var(--color-label-2)] mb-2">Other requests from {p?.name ?? "this property"}</div>
              <ul className="space-y-1">
                {others.map((o) => (
                  <li key={o.id}><Link href={`/admin/support/${o.id}`} className="flex items-center gap-2 min-h-10 px-2 -mx-2 rounded-lg hover:bg-[var(--color-fill)] min-w-0">
                    <span className="num text-[11.5px] text-[var(--color-label-3)] shrink-0">{ticketNo(o.no)}</span><span className="text-[13px] truncate flex-1">{o.subject}</span><StatusChip status={o.status} desk className="!h-5 !text-[10px]" />
                  </Link></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
