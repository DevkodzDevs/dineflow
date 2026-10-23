"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, MessageSquare, Lightbulb, HeartHandshake, Send, EyeOff, Eye, Inbox, MessagesSquare, Check, type LucideIcon } from "lucide-react";
import { ROLE_LABEL, type Role } from "@dineflow/shared";
import { Sheet, Switch, cn, useToast, FlapBreathe } from "@/components/ui";
import { VOICE_KINDS, VOICE_TOPICS, VOICE_STATUS, kindOf, topicOf, type VoiceKind, type VoiceAbout, type VoiceStatus } from "@/lib/voice";
import { sendVoice, replyVoice, setVoiceStatus, openVoice, type Reply } from "./actions";

export type Item = {
  id: string; kind: VoiceKind; about: VoiceAbout | null; subject: string; body: string; anonymous: boolean;
  author_name: string | null; author_role: string | null; status: VoiceStatus; created_at: string; staff_at: string;
  owner_at: string | null; owner_seen_at: string | null; author_seen_at: string | null; resolved_at: string | null;
};

const ICON: Record<VoiceKind, LucideIcon> = { complaint: AlertTriangle, feedback: MessageSquare, suggestion: Lightbulb, appreciation: HeartHandshake };
const wash = (hue: string, pct = 14) => `color-mix(in srgb, ${hue} ${pct}%, transparent)`;
const ink = (hue: string) => `color-mix(in srgb, ${hue} 80%, var(--color-label))`;
const t = (v: string | null) => (v ? new Date(v).getTime() : 0);
/** "just now", "12 min ago", "3 h ago", "Yesterday", "14 Oct" — India time. */
function ago(iso: string) {
  const s = Math.round((Date.now() - t(iso)) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
const roleName = (r: string | null) => (r ? ROLE_LABEL[r as Role] ?? r : "");
/** New for this side: the owner — a word from the staff since they last looked; the author — the owner's answer or move. */
const unreadFor = (i: Item, owner: boolean) => (owner ? t(i.staff_at) > t(i.owner_seen_at) : !!i.owner_at && t(i.owner_at) > t(i.author_seen_at));

function KindChip({ kind }: { kind: VoiceKind }) {
  const k = kindOf(kind); const Icon = ICON[k.key];
  return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12.5px] font-bold shrink-0" style={{ background: wash(k.hue), color: ink(k.hue) }}><Icon size={13} aria-hidden />{k.label}</span>;
}
function StatusChip({ status, owner }: { status: VoiceStatus; owner: boolean }) {
  const s = VOICE_STATUS[status];
  return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-bold shrink-0 whitespace-nowrap" style={{ background: wash(s.hue), color: ink(s.hue) }} data-voice-state={status}>
    <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.hue }} aria-hidden />{owner ? s.label : s.staff}</span>;
}

/**
 * Feedback & complaints (0124). Staff: a composer (what it is, what about, a title and the message, with or without
 * the name) beside "What I sent", each opening its thread. The owner: an inbox — open / new / working on it /
 * resolved, by kind — each card opening the thread with the answer box and the status buttons.
 */
export function VoiceClient({ items, owner, name }: { items: Item[]; owner: boolean; name: string }) {
  const [open, setOpen] = useState<Item | null>(null);
  const live = open ? items.find((i) => i.id === open.id) ?? open : null;   // the row as the last render knows it
  return (
    <>
      {owner ? <OwnerInbox items={items} onOpen={setOpen} /> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
          <Composer name={name} />
          <Mine items={items} onOpen={setOpen} />
        </div>)}
      <Sheet open={!!live} onClose={() => setOpen(null)} title={live?.subject ?? ""} wide>
        {live && <Thread key={live.id} item={live} owner={owner} />}
      </Sheet>
    </>
  );
}

function Composer({ name }: { name: string }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [kind, setKind] = useState<VoiceKind | null>(null);
  const [about, setAbout] = useState<VoiceAbout | null>(null);
  const [subject, setSubject] = useState(""); const [body, setBody] = useState(""); const [anon, setAnon] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = !!kind && subject.trim().length >= 3 && body.trim().length >= 5;
  const send = () => start(async () => {
    setErr(null);
    const r = await sendVoice(kind!, about, subject, body, anon);
    if ("error" in r) { setErr(r.error!); return; }
    toast("Sent to the owner — the answer comes back here");
    setKind(null); setAbout(null); setSubject(""); setBody(""); setAnon(false);
  });
  const step = (n: number, label: string, opt?: string) => (
    <div className="flex items-center gap-2 mb-2.5"><span className="h-6 w-6 rounded-full grid place-items-center text-[12px] font-extrabold bg-[var(--color-label)] text-[var(--color-on-label)] num shrink-0">{n}</span>
      <span className="text-[14px] font-bold">{label}</span>{opt && <span className="text-[12px] text-steel">{opt}</span>}</div>);
  return (
    <section className="card !p-4 sm:!p-5 min-w-0" data-voice-form>
      {step(1, "What is it?")}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="What is it?">
        {VOICE_KINDS.map((k) => { const Icon = ICON[k.key]; const on = kind === k.key; return (
          <button key={k.key} type="button" aria-pressed={on} onClick={() => setKind(k.key)} data-voice-kind={k.key}
            className={cn("!min-h-[84px] min-w-0 rounded-2xl p-3 flex flex-col items-start gap-1.5 text-left transition-colors", !on && "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}
            style={on ? { background: wash(k.hue, 16), boxShadow: `inset 0 0 0 2px ${k.hue}` } : undefined}>
            <span className="h-8 w-8 rounded-xl grid place-items-center shrink-0" style={{ background: wash(k.hue, 20), color: k.hue }}>{on ? <Check size={16} strokeWidth={3} aria-hidden /> : <Icon size={16} aria-hidden />}</span>
            <span className="text-[14px] font-extrabold leading-tight">{k.label}</span>
            <span className="text-[11.5px] leading-snug text-steel line-clamp-2">{k.hint}</span>
          </button>); })}
      </div>

      <div className="mt-5">{step(2, "What is it about?", "— if you like")}
        <div className="flex flex-wrap gap-2" role="group" aria-label="What is it about?">
          {VOICE_TOPICS.map((x) => (
            <button key={x.key} type="button" aria-pressed={about === x.key} onClick={() => setAbout((a) => (a === x.key ? null : x.key))} data-voice-topic={x.key}
              className={cn("chip [@media(pointer:coarse)]:!min-h-11", about === x.key && "on")}>{x.label}</button>))}
        </div>
      </div>

      <div className="mt-5">{step(3, "Tell the owner")}
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="A short title — e.g. Split shifts every day" aria-label="Title" data-voice-subject />
        <textarea className="mt-2" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} aria-label="Your message"
          placeholder="What happened, or what would help?" data-voice-body />
        <div className="mt-1 text-right text-[11.5px] text-steel num">{body.length}/2000</div>
      </div>

      <label className="mt-3 flex items-center gap-3 rounded-2xl bg-[var(--color-fill)] px-3.5 py-3 !min-h-14 cursor-pointer" data-voice-anon>
        <span className="h-9 w-9 rounded-xl grid place-items-center shrink-0 bg-[var(--color-bg-2)] text-steel">{anon ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold">Send without my name</span>
          <span className="block text-[12px] text-steel leading-snug">{anon ? "Owner sees “Anonymous”; answers still come here." : <>The owner sees it is from <b className="text-[var(--color-label)]">{name}</b>.</>}</span>
        </span>
        <Switch on={anon} onChange={setAnon} name="Send without my name" />
      </label>

      {err && <p className="mt-3 text-[14px] font-semibold text-chili" role="alert">{err}</p>}
      <button type="button" disabled={!ready || pending} onClick={send} className="svc-btn go w-full mt-4" data-voice-send>
        <Send size={18} aria-hidden /> Send to the owner</button>
      {!ready && <p className="mt-2 text-center text-[12px] text-steel">Pick a kind, title and message.</p>}
    </section>
  );
}

function Row({ item, owner, onOpen }: { item: Item; owner: boolean; onOpen: (i: Item) => void }) {
  const k = kindOf(item.kind); const Icon = ICON[k.key]; const fresh = unreadFor(item, owner); const topic = topicOf(item.about);
  return (
    <button type="button" onClick={() => onOpen(item)} data-voice-item={item.id} data-unread={fresh || undefined}
      className="card !p-4 w-full min-w-0 text-left flex flex-col gap-2.5 hover:bg-[var(--color-fill)] transition-colors relative">
      <span className="flex items-center gap-2 min-w-0">
        <span className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: wash(k.hue, 18), color: k.hue }}><Icon size={17} aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold leading-snug truncate">{item.subject}</span>
          <span className="block text-[12px] text-steel truncate">{k.label}{topic ? ` · ${topic}` : ""} · {ago(item.created_at)}</span>
        </span>
        {fresh && <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-red)] shrink-0" aria-label={owner ? "New" : "New answer"} />}
      </span>
      {owner && <span className="text-[13.5px] text-steel leading-snug line-clamp-2">{item.body}</span>}
      <span className="flex flex-wrap items-center gap-2 min-w-0">
        <StatusChip status={item.status} owner={owner} />
        {owner
          ? item.anonymous
            ? <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-steel min-w-0"><EyeOff size={13} aria-hidden />Anonymous</span>
            : <span className="text-[12.5px] font-semibold min-w-0 truncate">{item.author_name}<span className="text-steel font-normal">{item.author_role ? ` · ${roleName(item.author_role)}` : ""}</span></span>
          : item.anonymous && <span className="inline-flex items-center gap-1.5 text-[12px] text-steel"><EyeOff size={13} aria-hidden />Sent without your name</span>}
        {fresh && !owner && <span className="ml-auto text-[12px] font-bold text-[var(--color-red)]">New answer</span>}
      </span>
    </button>
  );
}

function Mine({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  return (
    <section className="min-w-0" data-voice-mine>
      <div className="flex items-baseline justify-between gap-2 mb-3"><h2 className="text-[17px] font-extrabold">What I sent</h2><span className="text-[12.5px] text-steel num">{items.length}</span></div>
      {items.length === 0
        ? <div className="card !p-6 text-center" data-voice-empty><span className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-steel"><MessagesSquare size={20} aria-hidden /></span>
            <p className="mt-3 text-[15px] font-bold">Nothing sent yet</p><p className="mt-1 text-[13px] text-steel">Your messages and answers show here.</p></div>
        : <div className="grid gap-3">{items.map((i) => <Row key={i.id} item={i} owner={false} onOpen={onOpen} />)}</div>}
    </section>
  );
}

type View = "open" | VoiceStatus | "all";
function OwnerInbox({ items, onOpen }: { items: Item[]; onOpen: (i: Item) => void }) {
  const [view, setView] = useState<View>("open"); const [kind, setKind] = useState<VoiceKind | "all">("all");
  // newest activity first: a staff answer on an old item brings it up
  const sorted = useMemo(() => [...items].sort((a, b) => Math.max(t(b.staff_at), t(b.owner_at)) - Math.max(t(a.staff_at), t(a.owner_at))), [items]);
  const inView = (i: Item, v: View) => (v === "all" ? true : v === "open" ? i.status !== "resolved" : i.status === v);
  const shown = sorted.filter((i) => inView(i, view) && (kind === "all" || i.kind === kind));
  const unread = items.filter((i) => unreadFor(i, true)).length;
  const VIEWS: { key: View; label: string; short: string }[] = [{ key: "open", label: "Open", short: "Open" }, { key: "new", label: "New", short: "New" }, { key: "in_progress", label: "Working on it", short: "On it" }, { key: "resolved", label: "Resolved", short: "Done" }, { key: "all", label: "All", short: "All" }];
  return (
    <div className="space-y-4" data-voice-inbox>
      {/* 2026-10-20 (the owner: "the filters should look modern and fit every screen"): one filter card — the status as
          five equal segments (count over a short word), the kind as five equal icon tiles — instead of ten chips that
          wrapped into five rows on a phone. Both rows stay one line from 1920 down to 360. */}
      <div className="card !p-2 sm:!p-2.5 space-y-2" data-voice-filters>
        <div className="grid grid-cols-5 gap-1 rounded-[16px] bg-[var(--color-fill)] p-1" role="group" aria-label="Show" data-voice-views>
          {VIEWS.map((v) => { const n = items.filter((i) => inView(i, v.key)).length; const on = view === v.key; return (
            <button key={v.key} type="button" aria-pressed={on} onClick={() => setView(v.key)} data-voice-view={v.key} title={v.label}
              className={cn("!min-h-[52px] min-w-0 rounded-[12px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors",
                on ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[var(--shadow-card)]" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>
              <span className={cn("num text-[19px] leading-none font-bold", on && v.key === "new" && n > 0 && "text-[var(--color-red)]")}>{n}</span>
              <span className="text-[11.5px] font-semibold leading-tight truncate max-w-full">{v.short}</span>
            </button>); })}
        </div>
        {/* phones: one swipeable row of pills with the whole word; from sm, five equal tiles */}
        <div className="grid grid-cols-5 gap-1.5 max-sm:flex max-sm:overflow-x-auto max-sm:snap-x max-sm:-mx-0.5 max-sm:px-0.5 max-sm:pt-2 max-sm:pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Kind" data-voice-kinds>
          {[{ key: "all" as const, plural: "All kinds", short: "All", hue: "var(--color-label-2)" }, ...VOICE_KINDS.map((k) => ({ key: k.key, plural: k.plural, short: k.plural, hue: k.hue }))].map((k) => {
            const Icon = k.key === "all" ? MessagesSquare : ICON[k.key]; const on = kind === k.key;
            const n = items.filter((i) => (k.key === "all" || i.kind === k.key) && inView(i, view)).length;
            return (
              <button key={k.key} type="button" aria-pressed={on} onClick={() => setKind(k.key)} data-voice-kind-filter={k.key === "all" ? undefined : k.key} title={k.plural}
                className={cn("!min-h-[64px] min-w-0 rounded-[14px] flex flex-col items-center justify-center gap-1 px-1 border transition-colors max-sm:!min-h-11 max-sm:shrink-0 max-sm:snap-start max-sm:flex-row max-sm:gap-2 max-sm:pl-1.5 max-sm:pr-3.5 max-sm:rounded-full",
                  on ? "border-transparent text-[var(--color-label)]" : "border-[var(--color-separator)] text-[var(--color-label-2)] hover:bg-[var(--color-fill)]")}
                style={on ? { background: `color-mix(in srgb, ${k.hue} 16%, transparent)`, boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${k.hue} 55%, transparent)` } : undefined}>
                <span className="relative grid place-items-center h-7 w-7 rounded-[9px]" style={{ background: `color-mix(in srgb, ${k.hue} 16%, transparent)`, color: k.hue }}>
                  <Icon size={15} aria-hidden />
                  {n > 0 && <b className="num absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center text-[10.5px] bg-[var(--color-label)] text-[var(--color-on-label)]">{n}</b>}
                </span>
                <span className="text-[11.5px] font-semibold leading-tight truncate max-w-full max-sm:text-[13px] max-sm:overflow-visible max-sm:whitespace-nowrap">{k.short}</span>
              </button>);
          })}
        </div>
        {unread > 0 && <div className="flex items-center justify-center gap-2.5 pt-0.5 text-[13px] font-bold text-[var(--color-red)]" data-voice-unread>{/* new messages breathe until the owner opens them (Flap.tsx) */}<FlapBreathe value={unread} pad={0} size="xs" tile="26px" say={`${unread} new`} />new — tap one to read it</div>}
      </div>
      {items.length === 0
        ? <div className="card !p-8 text-center" data-voice-empty><span className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-steel"><Inbox size={20} aria-hidden /></span>
            <p className="mt-3 text-[16px] font-bold">Nothing from your team yet</p>
            <p className="mt-1 text-[13px] text-steel max-w-[46ch] mx-auto">Staff messages land here. Only you see them.</p></div>
        : shown.length === 0
          ? <div className="card !p-6 text-center text-[14px] text-steel">Nothing here — choose another filter above.</div>
          : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{shown.map((i) => <Row key={i.id} item={i} owner onOpen={onOpen} />)}</div>}
    </div>
  );
}

function Bubble({ mine, who, when, children }: { mine: boolean; who: string; when: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[86%] min-w-0 rounded-2xl px-3.5 py-2.5", mine ? "rounded-br-md bg-[color-mix(in_srgb,var(--color-tint)_14%,var(--color-bg-2))]" : "rounded-bl-md bg-[var(--color-fill)]")}>
        <div className="text-[11.5px] font-bold text-steel mb-0.5">{who} · <span className="font-normal">{when}</span></div>
        <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap break-words">{children}</div>
      </div>
    </div>
  );
}

function Thread({ item, owner }: { item: Item; owner: boolean }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [replies, setReplies] = useState<Reply[] | null>(null); const [text, setText] = useState(""); const [err, setErr] = useState<string | null>(null);
  // the thread, and the item marked read, once when the sheet opens on it
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return; asked.current = true;
    start(async () => { const r = await openVoice(item.id); if ("error" in r) setErr(r.error!); else setReplies(r.replies); });
  }, [item.id]);
  const topic = topicOf(item.about);
  const from = item.anonymous ? (owner ? "Anonymous" : "You · without your name") : owner ? `${item.author_name ?? "Staff"}${item.author_role ? ` · ${roleName(item.author_role)}` : ""}` : "You";
  const send = () => start(async () => {
    setErr(null); const r = await replyVoice(item.id, text);
    if ("error" in r) { setErr(r.error!); return; }
    setText(""); toast(owner ? "Answer sent" : "Added — the owner sees it");
    const t2 = await openVoice(item.id); if (!("error" in t2)) setReplies(t2.replies);
  });
  const move = (s: VoiceStatus) => start(async () => { const r = await setVoiceStatus(item.id, s); if ("error" in r) toast(r.error!, "err"); else toast(VOICE_STATUS[s].label); });
  return (
    <div className="space-y-4" data-voice-thread>
      <div className="flex flex-wrap items-center gap-2">
        <KindChip kind={item.kind} />{topic && <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[var(--color-fill)] text-[12.5px] font-semibold text-steel">{topic}</span>}
        <StatusChip status={item.status} owner={owner} />
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] text-steel">{item.anonymous && <EyeOff size={13} aria-hidden />}{from}</span>
      </div>

      {owner && (
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Where it stands" data-voice-statuses>
          {(["seen", "in_progress", "resolved"] as const).map((s) => { const on = item.status === s; const st = VOICE_STATUS[s]; return (
            <button key={s} type="button" aria-pressed={on} disabled={pending} onClick={() => move(s)} data-voice-status={s}
              className={cn("!min-h-11 rounded-xl text-[13px] font-bold px-2 min-w-0 truncate", !on && "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}
              style={on ? { background: wash(st.hue, 18), color: ink(st.hue), boxShadow: `inset 0 0 0 2px ${st.hue}` } : undefined}>{st.label}</button>); })}
        </div>)}

      <div className="space-y-2.5" data-voice-messages>
        <Bubble mine={!owner} who={owner ? from : "You"} when={ago(item.created_at)}>{item.body}</Bubble>
        {replies === null
          ? <div className="h-14 rounded-2xl bg-[var(--color-fill)] animate-pulse" aria-label="Loading the answers" />
          : replies.map((r) => {
              const mine = owner ? r.side === "owner" : r.side === "staff";
              const who = r.side === "owner" ? (owner ? "You" : r.by_name ?? "The owner") : owner ? (r.by_name ?? "Anonymous") : "You";
              return <Bubble key={r.id} mine={mine} who={who} when={ago(r.created_at)}>{r.body}</Bubble>; })}
        {replies !== null && replies.length === 0 && <p className="text-center text-[12.5px] text-steel py-1">{owner ? "No answer yet — write one below." : "No answer yet — the owner will reply here."}</p>}
      </div>

      <div className="rounded-2xl bg-[var(--color-fill)] p-2.5">
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} aria-label={owner ? "Your answer" : "Add to this"} data-voice-reply
          placeholder={owner ? (item.anonymous ? "Answer them — they will see it here" : `Answer ${item.author_name ?? "them"} — they will read it here`) : "Add to this — the owner reads it"} />
        {err && <p className="mt-2 text-[13.5px] font-semibold text-chili" role="alert">{err}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-steel num">{text.length}/2000</span>
          <button type="button" disabled={pending || !text.trim()} onClick={send} className="svc-btn go sm !px-5" data-voice-reply-send><Send size={16} aria-hidden />{owner ? "Send answer" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
