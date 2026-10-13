"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, X, Send, Mail, Clock3, ShieldCheck, ChevronRight, LifeBuoy, Info, Loader2 } from "lucide-react";
import { Button, Card, Segmented, Switch, cn } from "@/components/ui";
import { KINDS, TOPICS, PRIORITIES, CONTACT, ticketNo, when, kindOf, SHOT_MAX, type Kind, type Priority, type Topic } from "@/lib/support";
import { kindIcon } from "@/components/support/icons";
import { StatusChip } from "@/components/support/chips";
import { uploadShots, whereAmI } from "@/components/support/shots";
import { raiseRequest, attachShots } from "./actions";

export type Req = { id: string; ticket_no: number; kind: string; topic: string | null; priority: string; status: string; subject: string; raised_by: string | null; raised_name: string | null; last_message_at: string; last_message_side: string; user_seen_at: string; created_at: string; rating: number | null };

/* what each kind of request asks for, in its own words */
const ASK: Record<Kind, { subject: string; body: string }> = {
  problem: { subject: "e.g. The kitchen printer stops after two tickets", body: "What happened, what you expected instead, and how to make it happen again — the screen, the button, the time." },
  complaint: { subject: "e.g. Bills took ten minutes to print on Saturday", body: "Tell us what happened and how it affected you. We read every word." },
  question: { subject: "e.g. How do I split a bill between two cards?", body: "Ask anything — where something is, how a screen works, what a number means." },
  idea: { subject: "e.g. Let waiters see table notes", body: "What would make DineFlow better for you? Ideas, praise and grumbles are all welcome." },
  billing: { subject: "e.g. My renewal was charged twice", body: "Membership, renewal, invoice or payment — the date and the amount help if you have them." },
  privacy: { subject: "e.g. Stop using our guests' numbers for offers", body: "Tell us what you want done with your data or your guests' data, and whose it is." },
};
const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", supervisor: "Supervisor", cashier: "Cashier", waiter: "Waiter", chef: "Chef", housekeeping: "Housekeeping", frontdesk: "Front desk" };

export function SupportClient({ requests, me, name, role, property, prefill }: { requests: Req[]; me: string; name: string; role: string; property: string; prefill: { kind: string | null; from: string | null } }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [tab, setTab] = useState<"new" | "list">("new");
  const [kind, setKind] = useState<Kind>(KINDS.some((k) => k.key === prefill.kind) ? (prefill.kind as Kind) : "problem");
  const [topic, setTopic] = useState<Topic>("withdraw");
  const [subject, setSubject] = useState(""); const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [allow, setAllow] = useState(false);
  const [files, setFiles] = useState<File[]>([]); const [previews, setPreviews] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null); const [stage, setStage] = useState<string | null>(null);
  const [ctx, setCtx] = useState<Record<string, string | number | boolean | null> | null>(null);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const pick = useRef<HTMLInputElement>(null);
  useEffect(() => { setCtx(whereAmI(prefill.from)); }, [prefill.from]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    const room = SHOT_MAX - files.length; if (!list || room <= 0) return;
    const fresh = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    setFiles((f) => [...f, ...fresh]); setPreviews((p) => [...p, ...fresh.map((f) => URL.createObjectURL(f))]);
  };
  const drop = (i: number) => { URL.revokeObjectURL(previews[i]); setFiles((f) => f.filter((_, j) => j !== i)); setPreviews((p) => p.filter((_, j) => j !== i)); };
  const ready = subject.trim().length >= 3 && body.trim().length >= 10 && !pending;

  const send = () => start(async () => {
    setErr(null); setStage("Sending…");
    const r = await raiseRequest({ kind, subject, body, priority, allow, topic: kind === "privacy" ? topic : null, context: { ...(ctx ?? whereAmI(prefill.from)), property } });
    if ("error" in r) { setErr(r.error ?? "It did not go through."); setStage(null); return; }
    if (files.length) {
      setStage(`Uploading ${files.length} screenshot${files.length > 1 ? "s" : ""}…`);
      const up = await uploadShots(r.restaurant_id, r.id, files);
      if (up.paths.length) await attachShots(r.id, r.message_id, up.paths);
    }
    router.push(`/help/${r.id}?sent=1`);
  });

  const unread = (r: Req) => r.raised_by === me && r.last_message_side === "support" && new Date(r.last_message_at) > new Date(r.user_seen_at);
  const counts = useMemo(() => ({ open: requests.filter((r) => !["resolved", "closed"].includes(r.status)).length, done: requests.filter((r) => ["resolved", "closed"].includes(r.status)).length }), [requests]);
  const shown = requests.filter((r) => filter === "all" || (filter === "open" ? !["resolved", "closed"].includes(r.status) : ["resolved", "closed"].includes(r.status)));
  const ask = ASK[kind];

  return (
    <div className="space-y-5" data-support>
      {/* other ways to reach DineFlow — the same facts as the legal pages (lib/company.ts) */}
      <div className="grid gap-2 sm:grid-cols-3" data-contact>
        <a href={`mailto:${CONTACT.email}`} className="feather flex items-center gap-3 p-3.5 min-w-0 hover:brightness-110 transition">
          <span className="h-9 w-9 rounded-[10px] grid place-items-center shrink-0 bg-[var(--color-fill)]"><Mail size={16} /></span>
          <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--color-label-3)]">Email</span><span className="block text-[13px] font-semibold truncate">{CONTACT.email}</span></span>
        </a>
        <div className="feather flex items-center gap-3 p-3.5 min-w-0">
          <span className="h-9 w-9 rounded-[10px] grid place-items-center shrink-0 bg-[var(--color-fill)]"><Clock3 size={16} /></span>
          <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--color-label-3)]">Support hours</span><span className="block text-[13px] font-semibold leading-snug">{CONTACT.hours}</span></span>
        </div>
        <a href={`mailto:${CONTACT.grievance}`} className="feather flex items-center gap-3 p-3.5 min-w-0 hover:brightness-110 transition">
          <span className="h-9 w-9 rounded-[10px] grid place-items-center shrink-0 bg-[var(--color-fill)]"><ShieldCheck size={16} /></span>
          <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--color-label-3)]">Privacy & grievances</span><span className="block text-[13px] font-semibold truncate">{CONTACT.grievance}</span><span className="block text-[11.5px] text-[var(--color-label-2)]">answered within {CONTACT.grievanceDays} days</span></span>
        </a>
      </div>

      {/* a phone or an iPad held upright: the form and the list as two tabs; side by side from lg */}
      <div className="lg:hidden">
        <Segmented value={tab} onChange={setTab} className="w-full [&>button]:flex-1"
          options={[{ value: "new", label: "New request" }, { value: "list", label: <>Your requests{requests.length ? ` · ${requests.length}` : ""}</> }]} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] items-start">
        <Card className={cn("space-y-5", tab !== "new" && "max-lg:hidden")} data-new-request>
          <div>
            <h3 className="text-xl">New request</h3>
            <p className="text-[13px] text-[var(--color-label-2)] mt-1">It reaches the DineFlow team at once. You will see every reply here{CONTACT.hours ? ` — ${CONTACT.hours.replace(/^Monday to Saturday/, "Mon–Sat")}` : ""}.</p>
          </div>

          <div>
            <div className="text-[12.5px] font-semibold mb-2">What is it about?</div>
            <div role="radiogroup" aria-label="What is it about?" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KINDS.map((k) => {
                const Icon = kindIcon(k.key); const on = kind === k.key;
                return (
                  <button key={k.key} type="button" role="radio" aria-checked={on} onClick={() => setKind(k.key)} data-kind={k.key}
                    className={cn("min-w-0 text-left rounded-2xl p-3 min-h-[96px] flex flex-col items-start gap-1.5 border transition-colors",
                      on ? "border-[var(--color-tint)] bg-[var(--color-green-2)] ring-1 ring-[var(--color-tint)]" : "border-[var(--color-separator)] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
                    <span className="h-8 w-8 rounded-[10px] grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, var(${k.tone}) 16%, transparent)`, color: `var(${k.tone})` }}><Icon size={16} /></span>
                    <span className="text-[13.5px] font-semibold leading-tight">{k.label}</span>
                    <span className="text-[11.5px] text-[var(--color-label-2)] leading-snug line-clamp-2">{k.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {kind === "privacy" && (
            <div className="rounded-2xl bg-[var(--color-fill)] p-3.5 space-y-3" data-privacy>
              <div className="text-[12.5px] font-semibold">What would you like done?</div>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => <button key={t.key} type="button" onClick={() => setTopic(t.key)} aria-pressed={topic === t.key} className={cn("chip", topic === t.key && "on")} data-topic={t.key}>{t.label}</button>)}
              </div>
              <p className="text-[12px] text-[var(--color-label-2)] flex gap-2 leading-snug"><ShieldCheck size={15} className="shrink-0 mt-px text-[var(--color-tint)]" />
                <span>Privacy and consent requests go to our Grievance Officer{CONTACT.officer ? ` (${CONTACT.officer})` : ""} and are answered within {CONTACT.grievanceDays} days. You can also write to <a className="underline" href={`mailto:${CONTACT.grievance}`}>{CONTACT.grievance}</a>.</span></p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3"><label htmlFor="sup-subject">Subject</label><span className="footnote num">{subject.length}/140</span></div>
            <input id="sup-subject" value={subject} onChange={(e) => setSubject(e.target.value.slice(0, 140))} placeholder={ask.subject} maxLength={140} data-subject />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3"><label htmlFor="sup-body">Details</label><span className="footnote num">{body.length}/5000</span></div>
            <textarea id="sup-body" rows={6} value={body} onChange={(e) => setBody(e.target.value.slice(0, 5000))} placeholder={ask.body} maxLength={5000} data-body />
          </div>

          <div className="space-y-2">
            <div className="text-[12.5px] font-semibold">How urgent is it?</div>
            <Segmented value={priority} onChange={setPriority} className="w-full [&>button]:flex-1 [&>button]:min-w-0 [&>button]:!px-2" options={PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} />
            <p className="text-[12px] text-[var(--color-label-2)]" data-priority-hint>{PRIORITIES.find((p) => p.key === priority)?.hint}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3"><span className="text-[12.5px] font-semibold">Screenshots</span><span className="footnote">optional · up to {SHOT_MAX}</span></div>
            <div className="flex flex-wrap gap-2" data-shots>
              {previews.map((p, i) => (
                <div key={p} className="relative h-20 w-20 rounded-xl overflow-hidden ring-1 ring-[var(--color-separator)] bg-[var(--color-fill)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:), nothing for next/image to optimise */}
                  <img src={p} alt={`Screenshot ${i + 1}`} className="h-full w-full object-cover" />
                  <button type="button" onClick={() => drop(i)} aria-label={`Remove screenshot ${i + 1}`} className="absolute top-1 right-1 h-7 w-7 !min-h-0 !min-w-0 rounded-full bg-black/65 text-white grid place-items-center"><X size={14} /></button>
                </div>
              ))}
              {files.length < SHOT_MAX && (
                <button type="button" onClick={() => pick.current?.click()} className="h-20 w-20 rounded-xl border-2 border-dashed border-[var(--color-separator)] flex flex-col items-center justify-center gap-1 text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:border-[var(--color-label-3)] transition-colors" data-add-shot>
                  <ImagePlus size={20} /><span className="text-[10.5px] font-semibold">Add</span>
                </button>
              )}
              <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" multiple hidden style={{ display: "none" }} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-2xl bg-[var(--color-fill)] p-3.5 cursor-pointer" data-consent>
            <ShieldCheck size={18} className="shrink-0 mt-0.5 text-[var(--color-tint)]" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold leading-snug">Let DineFlow open your property to look into this</span>
              <span className="block text-[12px] text-[var(--color-label-2)] mt-0.5 leading-snug">Only for this request. Everything done inside is logged, and you can take it back at any time.</span>
            </span>
            <Switch on={allow} onChange={setAllow} name="Let DineFlow open the property for this request" />
          </label>

          <details className="group rounded-2xl border border-[var(--color-separator)] px-3.5 py-2.5 text-[12.5px]" data-context>
            <summary className="cursor-pointer font-semibold text-[var(--color-label-2)] list-none flex items-center gap-2 min-h-8"><Info size={14} /> What is sent with it <ChevronRight size={14} className="ml-auto transition-transform group-open:rotate-90" /></summary>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[var(--color-label-2)]">
              <dt>Property</dt><dd className="text-[var(--color-label)] truncate">{property}</dd>
              <dt>You</dt><dd className="text-[var(--color-label)] truncate">{name} · {ROLE[role] ?? role}</dd>
              <dt>Page</dt><dd className="text-[var(--color-label)] truncate">{(ctx?.page as string) ?? "—"}</dd>
              <dt>Device</dt><dd className="text-[var(--color-label)] truncate">{(ctx?.device as string) ?? "—"}</dd>
              <dt>Screen</dt><dd className="text-[var(--color-label)] num">{(ctx?.screen as string) ?? "—"}</dd>
            </dl>
          </details>

          {err && <p className="rounded-xl bg-[var(--color-red-2)] px-3.5 py-2.5 text-[13px] text-[var(--color-red)]" role="alert">{err}</p>}
          <Button className="w-full" disabled={!ready} onClick={send} data-send>
            {pending ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />} {pending ? stage ?? "Sending…" : "Send to DineFlow support"}
          </Button>
          {!ready && !pending && <p className="-mt-3 text-center text-[11.5px] text-[var(--color-label-3)]">A subject of three characters and a few words of detail, and it is ready to send.</p>}
        </Card>

        <section className={cn("space-y-3 min-w-0", tab !== "list" && "max-lg:hidden")} data-requests>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xl">Your requests</h3>
            <div className="ml-auto flex gap-1.5">
              {([["open", `Open${counts.open ? ` · ${counts.open}` : ""}`], ["done", "Sorted"], ["all", "All"]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} className={cn("chip", filter === k && "on")}>{l}</button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="feather p-7 text-center" data-empty>
              <div className="mx-auto h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center text-[var(--color-label-2)]"><LifeBuoy size={20} /></div>
              <p className="mt-3 text-[13.5px] font-semibold">{requests.length ? "Nothing here" : "No requests yet"}</p>
              <p className="mt-1 text-[12.5px] text-[var(--color-label-2)]">{requests.length ? "Try another filter." : "When something is not right — or could be better — tell us with the form."}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {shown.map((r) => {
                const k = kindOf(r.kind); const Icon = kindIcon(r.kind); const fresh = unread(r);
                return (
                  <li key={r.id}>
                    <Link href={`/help/${r.id}`} className="feather feather-lift flex items-center gap-3 p-3.5 pr-3 min-w-0" data-request={r.ticket_no} data-unread={fresh || undefined}>
                      <span className="h-10 w-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, var(${k.tone}) 16%, transparent)`, color: `var(${k.tone})` }}><Icon size={17} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 min-w-0"><span className={cn("text-[14px] truncate", fresh ? "font-bold" : "font-semibold")}>{r.subject}</span>{fresh && <span className="h-2 w-2 rounded-full bg-[var(--color-tint)] shrink-0" aria-label="New reply" />}</span>
                        <span className="block text-[12px] text-[var(--color-label-2)] truncate" suppressHydrationWarning>
                          <span className="num">{ticketNo(r.ticket_no)}</span> · {k.label} · {when(r.last_message_at)}{r.raised_by !== me && r.raised_name ? ` · ${r.raised_name}` : ""}
                        </span>
                      </span>
                      <StatusChip status={r.status} />
                      <ChevronRight size={16} className="text-[var(--color-label-3)] shrink-0" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
