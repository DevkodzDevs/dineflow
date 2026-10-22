"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, BellRing, CheckCircle2, Users, Hourglass, Vibrate, VibrateOff, ArrowUp } from "lucide-react";
import { buzz, canBuzz } from "@/lib/buzz";
import { playTone, unlockAudio } from "@/lib/notify";
import { getClient } from "@/lib/supabase/lazy";
import { Flip, Countdown } from "@/components/ui";
import { GuestNotice } from "@/components/legal/GuestNotice";

type S = { token: string; name: string; party: number; status: "waiting" | "called" | "seated" | "left"; place: number; waiting: number; minutes: number | null; table: string | null; restaurant: string };

/** This device's place in this property's queue, so scanning the door code again (or coming back from the menu)
 *  shows the place instead of an empty form. A private window may refuse storage — the page works without it. */
const KEPT = (slug: string) => `df-queue:${slug}`;
const keep = (slug: string, token: string | null) => { try { if (token) localStorage.setItem(KEPT(slug), token); else localStorage.removeItem(KEPT(slug)); } catch {} };
const kept = (slug: string) => { try { return localStorage.getItem(KEPT(slug)); } catch { return null; } };
/** Buzz on every update — on unless this device turned it off. */
const ALERTS = "df-queue-buzz";
const alertsOn = () => { try { return localStorage.getItem(ALERTS) !== "off"; } catch { return true; } };

/** The guest's page: join with a name and party size, then watch your place move up. It asks every 4 s while it is
 *  on screen and at once when the guest comes back to it — Table ready and Seat now reached it up to 20 s late, or
 *  only on a refresh (2026-10-21, the owner). A hidden page does not ask. */
export function QueueClient({ slug, name, initial }: { slug: string; name: string | null; initial: S | null }) {
  const router = useRouter();
  const [s, setS] = useState<S | null>(initial); const [form, setForm] = useState({ name: "", phone: "", party: 2 }); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  /* A guest opens this on their own phone, often on mobile data, and all it has to do at first is
     show a name and a form. The client is fetched when they actually press something. */
  const token = s?.token, status = s?.status;
  useEffect(() => {
    if (!token || status === "seated" || status === "left") return;
    let alive = true;
    const pull = async () => { if (document.hidden) return; const { data } = await (await getClient()).rpc("queue_status", { p_token: token }); if (alive && data) setS(data as S); };
    const i = setInterval(pull, 4000); const back = () => { if (!document.hidden) void pull(); };
    document.addEventListener("visibilitychange", back); window.addEventListener("focus", back);
    return () => { alive = false; clearInterval(i); document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, [token, status]);
  /* Every update buzzes the phone and says what changed in a line at the top (2026-10-23, the owner: "vibration for
     each update"): moved up a place — a double pulse; called — a long triple, a chime and the tab's title; seated — a
     double and a chime. Android vibrates once the page has been touched; an iPhone gets a haptic tick where iOS allows
     it (lib/buzz.ts), and the chime. A hidden page asks nothing, so a locked phone hears it when it is opened. */
  const [alerts, setAlerts] = useState(true); const [touched, setTouched] = useState(true); const [canBuzzHere, setCanBuzz] = useState(true);
  const [update, setUpdate] = useState<{ text: string; tone: "up" | "called" | "seated"; n: number } | null>(null);
  useEffect(() => {
    setAlerts(alertsOn()); setCanBuzz(canBuzz());
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) { setTouched(false); const t = () => { setTouched(true); unlockAudio(); }; window.addEventListener("pointerdown", t, { once: true }); return () => window.removeEventListener("pointerdown", t); }
    const t = () => unlockAudio(); window.addEventListener("pointerdown", t, { passive: true }); return () => window.removeEventListener("pointerdown", t);
  }, []);
  const was = useRef<{ status?: string; place?: number }>({ status, place: s?.place });
  useEffect(() => {
    const prev = was.current; was.current = { status, place: s?.place };
    if (!s || !prev.status) return;
    let u: { text: string; tone: "up" | "called" | "seated" } | null = null;
    if (prev.status !== status && status === "called") u = { text: "You're up — please come to the host stand", tone: "called" };
    else if (prev.status !== status && status === "seated") u = { text: s.table ? `Table ${s.table} is ready for you` : "Your table is ready", tone: "seated" };
    else if (status === "waiting" && prev.place && s.place < prev.place) u = { text: s.place === 1 ? "You're next in line" : `You moved up — now number ${s.place}`, tone: "up" };
    if (!u) return;
    setUpdate((x) => ({ ...u!, n: (x?.n ?? 0) + 1 }));
    if (!alertsOn()) return;
    buzz(u.tone === "up" ? "moved" : u.tone);
    if (u.tone !== "up") playTone(u.tone === "called" ? "rush" : "chime", 85);
  }, [status, s?.place]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!update || update.tone === "called") return; const t = setTimeout(() => setUpdate(null), 8000); return () => clearTimeout(t); }, [update]);
  // the tab says it too, for a guest who has switched to another tab
  useEffect(() => { if (status !== "called") return; const base = document.title; document.title = "🔔 You're up! · " + (name ?? ""); return () => { document.title = base; }; }, [status, name]);
  const toggleAlerts = () => { const on = !alerts; setAlerts(on); try { localStorage.setItem(ALERTS, on ? "on" : "off"); } catch {} setTouched(true); unlockAudio(); if (on) buzz("sent"); };
  useEffect(() => { if (s?.token) history.replaceState(null, "", `?t=${s.token}`); }, [s?.token]);
  // a place this device already holds here comes back (2026-10-20: going Back never leaves the queue)
  useEffect(() => {
    if (initial) return; const t = kept(slug); if (!t) return;
    (async () => { const { data } = await (await getClient()).rpc("queue_status", { p_token: t }); const st = data as S | null; if (st && (st.status === "waiting" || st.status === "called")) setS(st); else keep(slug, null); })();
  }, [initial, slug]);
  useEffect(() => { if (!s) return; keep(slug, s.status === "waiting" || s.status === "called" ? s.token : null); }, [s, slug]);
  const join = async () => { setBusy(true); setErr(null); const { data, error } = await (await getClient()).rpc("queue_join", { p_slug: slug, p_name: form.name, p_phone: form.phone, p_party: form.party }); setBusy(false); if (error) setErr(error.message); else setS(data as S); };
  const leave = async () => { if (!s) return; await (await getClient()).rpc("queue_leave", { p_token: s.token }); setS({ ...s, status: "left" }); };
  /** Back to where they came from on this site; straight from the door code there is nowhere behind them, so the
   *  property's own page (the storefront the queue belongs to). Never leaves the queue. */
  const back = () => {
    try { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; } } catch {}
    router.push(`/dine/${slug}`);
  };

  if (!name) return <main className="min-h-dvh grid place-items-center p-6"><p className="text-[var(--color-label-2)]">This place isn't taking a queue right now.</p></main>;
  const queued = !!s && (s.status === "waiting" || s.status === "called");

  return (
    <main className="min-h-dvh max-w-md mx-auto px-5 pt-4 pb-8">
      <button type="button" onClick={back} data-queue-back aria-label={queued ? "Back — your place in the queue is kept" : "Back"}
        className="!min-h-11 h-11 -ml-1 mb-4 inline-flex items-center gap-1 pl-2 pr-4 rounded-full bg-[var(--color-fill)] text-[15px] font-semibold text-[var(--color-label)] hover:bg-[var(--color-fill-2)] active:scale-[.97] transition">
        <ChevronLeft size={20} aria-hidden /> Back
      </button>
      <div className="eyebrow">{name}</div>
      {queued && update && (
        <div key={update.n} role="status" aria-live="assertive" data-queue-update={update.tone}
          className={`queue-update mt-3 rounded-[16px] px-4 py-3 flex items-center gap-2.5 text-[14.5px] font-bold ${update.tone === "up" ? "bg-[var(--color-blue-2)] text-[var(--color-blue)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]"}`}>
          {update.tone === "up" ? <ArrowUp size={18} aria-hidden /> : update.tone === "called" ? <BellRing size={18} aria-hidden /> : <CheckCircle2 size={18} aria-hidden />}{update.text}
        </div>
      )}
      {!s ? (<>
        <h1 className="text-[34px] mt-1">Join the queue</h1>
        <p className="text-[var(--color-label-2)] mt-2">Add your name and watch your place here — no app needed.</p>
        <div className="stack mt-6">
          <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Phone (optional, so we can call you)" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div><label>How many of you</label><div className="flex gap-2 mt-2 flex-wrap">{[1, 2, 3, 4, 5, 6, 8].map((n) => <button key={n} onClick={() => setForm({ ...form, party: n })} className={`chip min-w-11 justify-center ${form.party === n ? "on" : ""}`}>{n}</button>)}</div></div>
          {err && <p className="text-sm text-[var(--color-red)]">{err}</p>}
          <button disabled={!form.name || busy} onClick={join} className="btn btn-filled w-full !h-[52px] !text-base">Join the queue</button>
          <GuestNotice property={name} use="to call you when your table is ready" />
        </div>
      </>) : s.status === "seated" ? (
        /* seated: one card, centred — a tick, the table on the flaps, their name (2026-10-21) */
        <section className="mt-4 rounded-[28px] p-6 text-center border border-[color-mix(in_srgb,var(--color-green)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-green)_10%,var(--color-bg-2))] shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--color-green)_70%,transparent)]" data-queue-state="seated">
          <span className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-[var(--color-green)] text-[var(--color-on-tint)] queue-pop" aria-hidden><CheckCircle2 size={34} /></span>
          <h1 className="text-[32px] mt-4 leading-tight">Your table's ready</h1>
          <p className="mt-1 text-[16px] font-semibold text-[var(--color-label-2)]">Come on in, {s.name.split(" ")[0]}.</p>
          <div className="mt-6 mb-2 flex justify-center"><Flip value={s.table ?? "—"} label="your table" tone="live" /></div>
          <p className="mt-3 text-[13.5px] text-[var(--color-label-2)]">Show this to the host — enjoy your meal.</p>
        </section>
      ) : s.status === "left" ? (
        <h1 className="text-[34px] mt-1">You've left the queue</h1>
      ) : s.status === "called" ? (<>
        {/* called: a green card that pulses, the one thing on the screen — where to go (2026-10-21) */}
        <section className="mt-4 rounded-[28px] p-6 text-center border-2 border-[var(--color-green)] bg-[color-mix(in_srgb,var(--color-green)_10%,var(--color-bg-2))] queue-call" data-queue-state="called">
          <span className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-[var(--color-green)] text-[var(--color-on-tint)] queue-ring" aria-hidden><BellRing size={30} /></span>
          <h1 className="text-[34px] mt-4 leading-tight">You're up!</h1>
          <p className="mt-2 text-[18px] font-bold text-[var(--color-label)]">Please come to the host stand.</p>
          <p className="mt-1 text-[14px] text-[var(--color-label-2)]">Your table for <span className="num">{s.party}</span> is being made ready, {s.name.split(" ")[0]}.</p>
        </section>
        {/* buzz on every update: on by default; on a phone not yet touched (reopened from the QR) one tap arms it */}
        <button type="button" onClick={toggleAlerts} data-queue-alerts={alerts ? (touched ? "on" : "arm") : "off"} aria-pressed={alerts}
          className={`mt-4 w-full min-h-11 rounded-[14px] px-4 py-2.5 flex items-center gap-2.5 text-left text-[13.5px] font-semibold border transition ${alerts && !touched ? "border-[var(--color-orange)] bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "border-[var(--color-separator)] bg-[var(--color-bg-2)] text-[var(--color-label-2)]"}`}>
          {alerts ? <Vibrate size={18} aria-hidden className={touched ? "text-[var(--color-green)]" : ""} /> : <VibrateOff size={18} aria-hidden />}
          <span className="flex-1">{!alerts ? "Buzz alerts are off — tap to turn on" : !touched ? "Tap here once so your phone can buzz when your place changes" : canBuzzHere ? "Your phone buzzes on every update" : "Alerts on — this phone can't vibrate, you'll hear a chime"}</span>
          <span className={`h-6 px-2 rounded-full grid place-items-center text-[11px] font-bold ${alerts ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)]"}`}>{alerts ? "On" : "Off"}</span>
        </button>
        <button onClick={leave} className="btn btn-gray w-full mt-6">Leave the queue</button>
        <p className="mt-3 text-center text-[13px] text-[var(--color-label-2)]" data-queue-kept>Leaving keeps your place — rescan or reopen this page to check.</p>
      </>) : (<>
        {/* waiting: the place and the wait on the flaps, then the line in one card, live */}
        <h1 className="text-[32px] mt-1 leading-tight">You're in the queue</h1>
        {/* the estimate is on the flaps only when there is one; "any minute" spelled across flap tiles ran off the
            screen (2026-10-21) — with no wait the place stands alone and the card below says so in words */}
        {(s.minutes ?? 0) > 0
          ? <div className="flip-row justify-center my-8"><Flip value={s.place} label="your place" /><Countdown seconds={(s.minutes ?? 0) * 60} label="about" doneLabel="now" /></div>
          : <div className="my-8 flex justify-center"><Flip value={s.place} label="your place" /></div>}
        <div className="rounded-[22px] p-4 border border-[var(--color-separator)] bg-[var(--color-bg-2)] grid grid-cols-2 gap-3" data-queue-state="waiting">
          <div className="flex items-center gap-2.5 min-w-0"><span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-fill)]" aria-hidden><Users size={18} /></span><div className="min-w-0 leading-tight"><div className="font-display num text-[20px]">{s.waiting}</div><div className="text-[12px] text-[var(--color-label-2)]">{s.waiting === 1 ? "party waiting" : "parties waiting"}</div></div></div>
          <div className="flex items-center gap-2.5 min-w-0"><span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center bg-[var(--color-fill)]" aria-hidden><Hourglass size={18} /></span><div className="min-w-0 leading-tight"><div className="font-display num text-[20px]">{s.party}</div><div className="text-[12px] text-[var(--color-label-2)]">table for</div></div></div>
          {(s.minutes ?? 0) <= 0 && <div className="col-span-2 rounded-[14px] px-3 py-2.5 text-center text-[15px] font-bold text-[var(--color-green)] bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)]" data-queue-soon>Any minute now — stay close</div>}
          <div className="col-span-2 flex items-center justify-center gap-2 text-[12.5px] font-semibold text-[var(--color-label-2)]"><span className="h-2 w-2 rounded-full bg-[var(--color-green)] animate-pulse" aria-hidden />Live — this page updates itself</div>
        </div>
        {/* buzz on every update: on by default; on a phone not yet touched (reopened from the QR) one tap arms it */}
        <button type="button" onClick={toggleAlerts} data-queue-alerts={alerts ? (touched ? "on" : "arm") : "off"} aria-pressed={alerts}
          className={`mt-4 w-full min-h-11 rounded-[14px] px-4 py-2.5 flex items-center gap-2.5 text-left text-[13.5px] font-semibold border transition ${alerts && !touched ? "border-[var(--color-orange)] bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "border-[var(--color-separator)] bg-[var(--color-bg-2)] text-[var(--color-label-2)]"}`}>
          {alerts ? <Vibrate size={18} aria-hidden className={touched ? "text-[var(--color-green)]" : ""} /> : <VibrateOff size={18} aria-hidden />}
          <span className="flex-1">{!alerts ? "Buzz alerts are off — tap to turn on" : !touched ? "Tap here once so your phone can buzz when your place changes" : canBuzzHere ? "Your phone buzzes on every update" : "Alerts on — this phone can't vibrate, you'll hear a chime"}</span>
          <span className={`h-6 px-2 rounded-full grid place-items-center text-[11px] font-bold ${alerts ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)]"}`}>{alerts ? "On" : "Off"}</span>
        </button>
        <button onClick={leave} className="btn btn-gray w-full mt-6">Leave the queue</button>
        <p className="mt-3 text-center text-[13px] text-[var(--color-label-2)]" data-queue-kept>Leaving keeps your place — rescan or reopen this page to check.</p>
      </>)}
    </main>
  );
}
