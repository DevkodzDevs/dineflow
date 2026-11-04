"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Users, Clock, Megaphone, Volume2, Bell, BellRing, Hourglass, X, QrCode, Share2, UserPlus } from "lucide-react";
import { Card, useToast, cn, ask, useNow } from "@/components/ui";
import { useLang } from "@/components/ui/Say";
import { scriptOf } from "@/lib/say";
import { useLive } from "@/lib/useLive";
import { enqueue } from "@/lib/offline/sync";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { setWalkin } from "../actions";

export type W = { id: string; token: string; name: string; phone: string | null; party: number; quoted_min: number | null; status: "waiting" | "called"; joined_at: string; called_at: string | null; table_id: string | null };

/* ───────── the voice at the host stand ─────────
   "Ravi, party of 4, your table is ready." in the device's language (the df-lang cookie, through useLang): Tamil and
   Hindi speak their own sentence; the name is said as it was typed. Only ever from a tap — Safari on an iPad will not
   speak without one. */
type Speech = "en" | "ta" | "hi";
const LINE: Record<Speech, { lang: string; say: (name: string, n: number) => string }> = {
  en: { lang: "en-IN", say: (name, n) => n === 1 ? `${name}, your table is ready. Please come to the host stand.` : `${name}, party of ${n}, your table is ready. Please come to the host stand.` },
  ta: { lang: "ta-IN", say: (name, n) => n === 1 ? `${name}, உங்கள் மேசை தயாராக உள்ளது. தயவுசெய்து வரவேற்பு இடத்திற்கு வாருங்கள்.` : `${name}, ${n} பேருக்கான உங்கள் மேசை தயாராக உள்ளது. தயவுசெய்து வரவேற்பு இடத்திற்கு வாருங்கள்.` },
  hi: { lang: "hi-IN", say: (name, n) => n === 1 ? `${name}, आपकी टेबल तैयार है। कृपया काउंटर पर आइए।` : `${name}, ${n} लोगों के लिए आपकी टेबल तैयार है। कृपया काउंटर पर आइए।` },
};
/** Speaks the call on this device. False when the browser cannot speak at all. A device with voices but none for
 *  Tamil or Hindi says the English sentence rather than reading Tamil script with an English voice (or not at all). */
function announce(name: string, party: number, want: Speech): boolean {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return false;
    const ss = window.speechSynthesis; const voices = ss.getVoices();
    const match = (l: string) => voices.find((v) => v.lang.replace("_", "-").toLowerCase() === l.toLowerCase()) ?? voices.find((v) => v.lang.toLowerCase().startsWith(l.slice(0, 2)));
    let k = want; let voice = match(LINE[k].lang);
    if (k !== "en" && voices.length && !voice) { k = "en"; voice = match(LINE.en.lang); }
    const u = new SpeechSynthesisUtterance(LINE[k].say(name, party));
    u.lang = LINE[k].lang; u.rate = 0.95; if (voice) u.voice = voice;
    ss.cancel(); ss.speak(u);
    return true;
  } catch { return false; }
}

/** Minutes as a person says them: 12 min, 1h 05m. */
const waited = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

/* a row's small action: an icon in a 44px square (48 on touch), its word beside it once the card is wide enough */
const ACT = "h-11 [@media(pointer:coarse)]:h-12 min-w-11 [@media(pointer:coarse)]:min-w-12 px-3 shrink-0 rounded-[14px] inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] transition-colors";

/**
 * The waiting list on the Join by QR screen: who is waiting, in the order they came, each with their place, party,
 * a live wait and where they are (waiting / called). **Call next** calls the first one still waiting — the same
 * `walkin_set … 'called'` as Pulse's Table ready, so the guest's /queue page alerts them exactly as before — and says
 * it aloud here. A called row can be said again, or taken off.
 *
 * No tables and no No-show here (2026-11-03, the owner: "Join by QR's waiting list doesn't need the table option and
 * the no-show"): tables are Pulse's — given by themselves when one that fits frees (0164), or set there by hand. Call
 * next calls the first guest whose table is ready (one is held for them), else the first in line.
 * Live through useLive on `walkins`; what the host does shows at once, ahead of the write.
 */
export function WaitList({ queue, listed, onShare, fill = false }: { queue: W[]; listed: boolean; onShare: () => void; fill?: boolean }) {
  useLive(["walkins"], 20000);
  const toast = useToast(); const [, start] = useTransition(); const { online } = useOffline();
  const speech = scriptOf(useLang().lang) as Speech;
  const now = useNow();
  const [last, setLast] = useState<{ id: string; name: string; party: number } | null>(null);
  /* what the host just did, ahead of the write coming back (as Pulse): Called shows at once, Remove takes the row
     off; a write that fails puts it back */
  const [mine, setMine] = useState<{ gone: Record<string, true>; called: Record<string, true> }>({ gone: {}, called: {} });
  const mark = (k: "gone" | "called", id: string, on = true) => setMine((m) => { const x = { ...m[k] }; if (on) x[id] = true; else delete x[id]; return { ...m, [k]: x }; });
  const live: W[] = queue.filter((w) => !mine.gone[w.id]).map((w) => mine.called[w.id] && w.status === "waiting" ? { ...w, status: "called" } : w);
  const next = live.find((w) => w.status === "waiting" && w.table_id) ?? live.find((w) => w.status === "waiting");
  const lastHere = last && live.some((w) => w.id === last.id) ? last : null;

  const write = (w: W, status: "called" | "left") => {
    if (status === "called") mark("called", w.id); else mark("gone", w.id);
    if (!online) { void enqueue("walkin_set", { id: w.id, status }, `Queue · ${w.name} ${status}`); return; }
    start(async () => {
      const r = await setWalkin(w.id, status);
      if ("error" in r && r.error) { toast(r.error, "err"); mark(status === "called" ? "called" : "gone", w.id, false); }
    });
  };
  /* speak first, inside the tap — an iPad drops speech started after an await */
  const sayIt = (w: { name: string; party: number }) => announce(w.name, w.party, speech);
  const call = (w: W) => {
    const spoke = sayIt(w);
    setLast({ id: w.id, name: w.name, party: w.party });
    write(w, "called");
    toast(spoke ? `Calling ${w.name}` : `${w.name} called · this device can't speak`);
  };
  const again = (w: { name: string; party: number }) => { if (!sayIt(w)) toast("This device can't speak", "err"); };
  const remove = async (w: W) => {
    if (!(await ask({ title: `Remove ${w.name}?`, body: "Takes them off the waiting list.", ok: "Remove", tone: "danger", icon: "trash" }))) return;
    write(w, "left");
  };

  return (
    /* fill (Join by QR from lg): the card is never taller than the screen under the top bar; its head and Call next stay
       put and only the rows scroll (data-waitlist-scroll) */
    <Card className={cn("min-w-0 !rounded-[24px] !p-4 sm:!p-5 @container", fill && "lg:flex lg:flex-col lg:max-h-[calc(100dvh-7.5rem)]")} data-waitlist>
      <div className="flex items-center gap-3">
        <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-blue-2)] text-[var(--color-blue)]" aria-hidden><Users size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-extrabold leading-tight flex items-center gap-2">Waiting list
            <span className="inline-grid place-items-center min-w-7 h-7 px-2 rounded-full bg-[var(--color-fill-2)] text-[14px] font-bold num" aria-live="polite" aria-label={`${live.length} on the list`}>{live.length}</span>
          </h2>
          <p className="text-[13px] text-steel mt-0.5 leading-snug">In order of arrival</p>
        </div>
      </div>

      {/* the one primary move: call the first party still waiting, out loud; the speaker says the last call again */}
      {next && (
        <div className="mt-4 flex items-stretch gap-2">
          <button type="button" className="svc-btn go flex-1 min-w-0 !px-4" onClick={() => call(next)} data-call-next>
            <Megaphone size={21} aria-hidden className="shrink-0" />
            <span>Call next</span>
            <span className="min-w-0 truncate font-semibold opacity-85 !whitespace-nowrap">· {next.name} · {next.party}</span>
          </button>
          {lastHere && <button type="button" className="svc-btn quiet !px-0 w-14 shrink-0" onClick={() => again(lastHere)} aria-label={`Say again: ${lastHere.name}`} title={`Say again · ${lastHere.name}`} data-say-again><Volume2 size={21} aria-hidden /></button>}
        </div>
      )}

      {live.length === 0 ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-[var(--color-separator)] px-5 py-7 text-center" data-waitlist-empty>
          <span className="mx-auto h-12 w-12 rounded-[16px] grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]">{listed ? <QrCode size={24} aria-hidden /> : <Users size={24} aria-hidden />}</span>
          <div className="mt-3 text-[16px] font-bold">No one waiting</div>
          <p className="mt-1 text-[13px] text-steel">{listed ? "Guests scan the code to join" : "Add guests on Pulse"}</p>
          {listed
            ? <button type="button" onClick={onShare} className="mt-3 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[13px] font-semibold"><Share2 size={15} aria-hidden /> Share the QR</button>
            : <Link href="/pulse" className="mt-3 inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[13px] font-semibold"><UserPlus size={15} aria-hidden /> Open Pulse</Link>}
        </div>
      ) : (
        <ol className={cn("mt-3 divide-y divide-[var(--color-separator)]", fill && "lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:-mr-2 lg:pr-2")} data-waitlist-scroll={fill ? "" : undefined}>
          {live.map((w, i) => {
            const called = w.status === "called";
            const m = now ? Math.max(0, Math.floor((now - Date.parse(w.joined_at)) / 60000)) : null;
            const tone = m == null || w.quoted_min == null ? undefined : m >= w.quoted_min + 10 ? "var(--color-red)" : m >= w.quoted_min ? "var(--color-orange)" : undefined;
            return (
              <li key={w.id} className="py-2.5 min-w-0" data-wait-row={w.status}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className={cn("h-9 w-9 shrink-0 rounded-full grid place-items-center font-display num text-[16px]", called ? "bg-[var(--color-green)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill-2)]")} aria-label={`Number ${i + 1} in line`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-extrabold text-[16px] leading-tight truncate min-w-0" data-wait-name>{w.name}</span>
                      <span className={cn("shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-bold", called ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-orange-2)] text-[var(--color-orange)]")} data-wait-state>
                        {called ? <><BellRing size={12} aria-hidden /> Called</> : <><Hourglass size={12} aria-hidden /> Waiting</>}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-label-2)] min-w-0">
                      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] shrink-0" title={`Party of ${w.party}`}><Users size={13} aria-hidden /><span className="num">{w.party}</span></span>
                      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--color-fill)] num shrink-0" style={tone ? { color: tone } : undefined} title={w.quoted_min != null ? `Told ${w.quoted_min} min` : "Waiting"} data-wait-time>
                        <Clock size={13} aria-hidden />{m == null ? "…" : waited(m)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {called ? (
                      <button type="button" className={ACT} onClick={() => again(w)} aria-label={`Say again: ${w.name}`} title="Say again" data-say-again><Volume2 size={18} aria-hidden /><span className="hidden @[34rem]:inline">Again</span></button>
                    ) : (
                      <button type="button" className={cn(ACT, "text-[var(--color-tint)]")} onClick={() => call(w)} aria-label={`Call ${w.name}`} title="Table ready — call them" data-call><Bell size={18} aria-hidden /><span className="hidden @[28rem]:inline">Call</span></button>
                    )}
                    <button type="button" className={cn(ACT, "text-steel hover:!bg-[var(--color-red-2)] hover:text-[var(--color-red)]")} onClick={() => void remove(w)}
                      aria-label={`Remove ${w.name}`} title="Remove" data-wait-remove>
                      <X size={18} aria-hidden /><span className="hidden @[34rem]:inline">Remove</span>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
