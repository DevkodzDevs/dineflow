"use client";
/* eslint-disable @next/next/no-img-element -- the logo is the property's own upload on any host */
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Hourglass, Users, Armchair, Volume2, VolumeX, ScanLine, UserPlus, Smartphone, ChevronRight, Timer, Clock3, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { QR } from "@/components/QR";
import { FlapShuffle } from "@/components/ui";
import { newlyCalled, boardLine, boardLangs, waitedText, waitLeft, typicalWait, type BoardFeed, type BoardLang, type BoardCalled } from "@/lib/queueBoard";
import { useScreenFeed } from "../../useScreenFeed";

const POLL = 4000;           // a call must reach the wall within seconds of the host's tap
const FRESH_MS = 45000;      // a number just called glows this long
const STRIP = 8;             // waiting cards on the strip before "+n more"
const ALSO = 4;              // earlier calls shown beside the hero

const LANGS: { v: BoardLang; label: string }[] = [{ v: "en", label: "EN" }, { v: "ta", label: "தமிழ்" }, { v: "hi", label: "हिन्दी" }];
const AUDIO_KEY = "df-board-audio";

function Clock() {
  const [now, setNow] = useState<{ t: string; d: string }>({ t: "", d: "" });
  useEffect(() => {
    const f = () => { const n = new Date(); setNow({
      t: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(n),
      d: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(n) }); };
    f(); const t = setInterval(f, 15000); return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right leading-none" suppressHydrationWarning>
      <div className="text-[clamp(26px,2.8vw,60px)] font-light tabular-nums tracking-tight">{now.t}</div>
      <div className="mt-[.3vw] text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)]">{now.d}</div>
    </div>
  );
}

/** Say one call on this device, in the board's language and then English (boardLangs). Only after a tap has unlocked sound —
 *  a browser refuses speech before one. Resolves when the last sentence ends, so calls queue instead of talking over each other. */
function speak(c: BoardCalled, lang: BoardLang): Promise<void> {
  return new Promise((done) => {
    try {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return done();
      const ss = window.speechSynthesis; const voices = ss.getVoices();
      const pick = (tag: string) => voices.find((v) => v.lang.replace("_", "-").toLowerCase() === tag.toLowerCase()) ?? voices.find((v) => v.lang.toLowerCase().startsWith(tag.slice(0, 2)));
      const lines = boardLangs(lang).map((l) => boardLine(l, c.no, c.table)).filter((l, i) => i === 0 || voices.length === 0 || pick(l.lang) || l.lang.startsWith("en"));
      let left = lines.length; if (!left) return done();
      for (const l of lines) {
        const u = new SpeechSynthesisUtterance(l.text); u.lang = l.lang; u.rate = 0.92; const v = pick(l.lang); if (v) u.voice = v;
        u.onend = u.onerror = () => { if (--left <= 0) done(); };
        ss.speak(u);
      }
      setTimeout(done, 15000);   // a voice that never reports back must not block the next call
    } catch { done(); }
  });
}

/** A short two-note chime before a call, so heads turn before the words. */
function chime() {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext); const ctx = new AC();
    const beep = (f: number, at: number) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.5); };
    beep(880, 0); beep(1320, 0.25);
    setTimeout(() => void ctx.close(), 1500);
  } catch { /* no sound here */ }
}

/** A number as the board prints it — the font's tabular figures, never a flap, for the small cards. */
const Num = ({ n, className }: { n: number; className?: string }) => <span className={clsx("font-display tabular-nums leading-none", className)}>{n}</span>;
/** "1 min ago", "just now" */
const agoText = (iso: string | null, now: number) => { if (!iso) return ""; const m = Math.floor((now - Date.parse(iso)) / 60000); return m <= 0 ? "just now" : m === 1 ? "1 min ago" : `${m} min ago`; };
/** A small uppercase label with its icon, in a colour. */
const Eyebrow = ({ icon: I, tone, children, className }: { icon: typeof BellRing; tone: string; children: React.ReactNode; className?: string }) => (
  <div className={clsx("flex items-center gap-[.6vw] text-[clamp(12px,1.05vw,24px)] font-bold uppercase tracking-[.2em]", className)} style={{ color: tone }}><I className="h-[1.3em] w-[1.3em]" aria-hidden />{children}</div>
);

/**
 * The board (redrawn 2026-11-10, the owner: "ultra modern, unique", then "better, perfect"). Always dark — the screen layout
 * marks <html> and ThemeKeeper holds dark for it, so a TV at the door looks the same whatever the till is set to. One hero:
 * the number called last, centred on the app's flap tiles in a green halo, its party and table under it and when it was
 * called; the numbers called before it in a column beside, the table large; the join QR on a glass card with its link; and
 * the waiting list as a strip along the bottom — the first marked NEXT, each card with a bar filling towards the minutes
 * the guest was told and the minutes left. Reads its feed every 4 s (15 s while nobody waits — lib/screenFeed.ts); a number just called glows and, with sound on, is chimed and
 * said in the board's language and then English. Names never reach this screen — the feed carries numbers, party sizes,
 * held tables and told minutes only. A dead key says Reconnecting…
 */
export function QueueBoard({ k, initial, base, lang: initialLang }: { k: string; initial: BoardFeed; base: string; lang: BoardLang }) {
  const [feed, setFeed] = useState<BoardFeed>(initial);
  const [lang, setLang] = useState<BoardLang>(initialLang);
  const [audio, setAudio] = useState<"off" | "arm" | "on">("off");
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const seen = useRef(new Set(initial.called.map((c) => c.no)));
  const langRef = useRef(lang); langRef.current = lang;
  const audioRef = useRef(audio); audioRef.current = audio;
  const saying = useRef<Promise<void>>(Promise.resolve());
  const [now, setNow] = useState(() => Date.now());

  /* sound was left on last time → ask for the one tap a browser needs before it will speak */
  useEffect(() => { try { if (localStorage.getItem(AUDIO_KEY) === "on") setAudio("arm"); } catch { /* fine */ } }, []);
  useEffect(() => {
    if (audio !== "arm") return;
    const arm = () => { setAudio("on"); try { window.speechSynthesis?.getVoices(); } catch { /* fine */ } };
    window.addEventListener("pointerdown", arm, { once: true }); return () => window.removeEventListener("pointerdown", arm);
  }, [audio]);
  const toggleAudio = () => {
    const on = audio !== "on"; setAudio(on ? "on" : "off");
    try { localStorage.setItem(AUDIO_KEY, on ? "on" : "off"); window.speechSynthesis?.getVoices(); } catch { /* fine */ }
    if (on) chime();
  };
  const switchLang = (v: BoardLang) => { setLang(v); try { const u = new URL(location.href); u.searchParams.set("lang", v); history.replaceState(null, "", u); } catch { /* fine */ } };

  const announce = useCallback((calls: BoardCalled[]) => {
    if (!calls.length) return;
    setFresh((s) => new Set([...s, ...calls.map((c) => c.no)]));
    setTimeout(() => setFresh((s) => { const n = new Set(s); calls.forEach((c) => n.delete(c.no)); return n; }), FRESH_MS);
    if (audioRef.current !== "on") return;
    for (const c of calls) saying.current = saying.current.then(() => { chime(); return new Promise<void>((r) => setTimeout(r, 700)); }).then(() => speak(c, langRef.current));
  }, []);

  /* lib/screenFeed.ts: the feed comes from the database's API; the app's GET route (app/api/screen/[key]/queue) is the
     fallback — never a server action, whose id changes with each build. Every 4 s while anyone waits or is called, every
     15 s while the list is empty. Twelve hours on it reloads itself — only when the server answers — for the new build. */
  const lost = useScreenFeed<BoardFeed>({
    fn: "screen_queue", k, route: `/api/screen/${encodeURIComponent(k)}/queue`, fast: POLL, initial,
    busy: (f) => f.waiting.length + f.called.length > 0,
    onTick: () => setNow(Date.now()),
    onFeed: (f) => { announce(newlyCalled(seen.current, f.called)); seen.current = new Set(f.called.map((c) => c.no)); setFeed(f); },
  });

  const joinUrl = feed.slug ? `${base}/queue/${feed.slug}` : null;
  const [hero, ...rest] = feed.called;            // the feed is newest call first
  const waiting = feed.waiting, next = waiting[0];
  const strip = waiting.slice(0, STRIP), more = waiting.length - strip.length;
  const typical = typicalWait(waiting);
  const ready = (feed.called.length ? "called" : next ? "next" : "none") as "called" | "next" | "none";

  return (
    <div className="board h-full flex flex-col px-[2vw] pt-[1.3vw] pb-[1vw] gap-[1.1vw] text-[var(--color-label)]" data-screen="queue" data-board-lang={lang} data-board-audio={audio}>
      {/* ── top bar: who, live, language, sound, the time ── */}
      <header className="flex items-center gap-[1.2vw] shrink-0">
        {feed.logo
          ? <img src={feed.logo} alt="" className="h-[clamp(40px,3.6vw,80px)] w-[clamp(40px,3.6vw,80px)] rounded-[1vw] object-cover" />
          : <span className="h-[clamp(40px,3.6vw,80px)] w-[clamp(40px,3.6vw,80px)] rounded-[1vw] grid place-items-center font-display text-[clamp(20px,1.9vw,42px)] bg-[var(--color-fill)]" aria-hidden>{feed.name.trim().charAt(0).toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <div className="text-[clamp(22px,2.3vw,52px)] font-black tracking-tight truncate leading-none">{feed.name}</div>
          <div className="mt-[.45vw] flex items-center gap-[.6vw] text-[clamp(11px,.95vw,20px)] font-bold uppercase tracking-[.16em] text-[var(--color-label-2)]">
            <span className="board-live h-[.6em] w-[.6em] rounded-full bg-[var(--color-green)]" aria-hidden />Live waiting list
            {lost && <span className="normal-case tracking-normal font-semibold text-[var(--color-red)]" data-screen-lost>· Reconnecting… (stuck? open the new screen link from Settings)</span>}
          </div>
        </div>
        <div className="flex items-center gap-[.3vw] rounded-full p-[.3vw] board-glass" role="group" aria-label="Language the calls are said in">
          {LANGS.map((l) => <button key={l.v} type="button" aria-pressed={lang === l.v} onClick={() => switchLang(l.v)} data-board-pick={l.v}
            className={clsx("min-h-11 px-[1.1vw] rounded-full text-[clamp(13px,1.05vw,22px)] font-bold transition-colors", lang === l.v ? "bg-[var(--color-label)] text-[var(--color-bg)]" : "text-[var(--color-label-2)] hover:text-[var(--color-label)]")}>{l.label}</button>)}
        </div>
        <button type="button" onClick={toggleAudio} aria-pressed={audio === "on"} data-board-sound={audio}
          className={clsx("min-h-11 inline-flex items-center gap-[.5vw] px-[1.2vw] rounded-full text-[clamp(13px,1.05vw,22px)] font-bold transition-colors board-glass",
            audio === "on" ? "!bg-[var(--color-green)] !text-[var(--color-on-tint)]" : audio === "arm" ? "!bg-[var(--color-orange)] !text-[var(--color-on-tint)] animate-pulse" : "text-[var(--color-label-2)]")}>
          {audio === "on" ? <Volume2 className="h-[1.2em] w-[1.2em]" aria-hidden /> : <VolumeX className="h-[1.2em] w-[1.2em]" aria-hidden />}
          {audio === "on" ? "Sound on" : audio === "arm" ? "Tap once for sound" : "Sound off"}
        </button>
        <Clock />
      </header>

      {/* ── the floor: the QR, then the one number being called ── */}
      <main className={clsx("flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] gap-[1.2vw]", joinUrl ? "grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]" : "grid-cols-1")}>
        {joinUrl && (
          <section className="min-h-0 rounded-[2vw] p-[1.5vw] flex flex-col board-glass" data-board-join>
            <Eyebrow icon={Sparkles} tone="var(--color-green)">Skip the wait</Eyebrow>
            <h2 className="mt-[.35vw] text-[clamp(18px,1.75vw,38px)] font-black tracking-tight leading-tight">Scan to join the queue</h2>
            <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,1fr)] grid-cols-[minmax(0,1fr)] place-items-center py-[.8vw]">
              {/* dark on light, always: a camera wants contrast */}
              <div className="board-qr rounded-[1.6vw] bg-white p-[.9vw] h-full max-h-[40vh] max-w-full aspect-square [&_img]:w-full [&_img]:h-auto [&_div]:!w-full [&_.shimmer]:!h-auto [&_.shimmer]:aspect-square"><QR value={joinUrl} size={480} className="w-full" /></div>
            </div>
            <div className="mx-auto max-w-full truncate rounded-full px-[1em] py-[.45em] text-[clamp(11px,.95vw,20px)] font-semibold tabular-nums bg-[var(--color-fill)] text-[var(--color-label-2)]" data-board-link>{joinUrl.replace(/^https?:\/\//, "")}</div>
            {/* three steps in one row, so the code above keeps the room */}
            <ol className="mt-[1vw] grid grid-cols-3 gap-[.6vw] text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)] text-center">
              {[[ScanLine, "Scan with your camera"], [UserPlus, "Add name and party size"], [Smartphone, "We buzz your phone"]].map(([I, t], i) => {
                const Icon = I as typeof ScanLine;
                return <li key={i} className="min-w-0 flex flex-col items-center gap-[.45vw] rounded-[1vw] bg-[var(--color-fill)] px-[.5vw] py-[.7vw]"><span className="h-[2.1em] w-[2.1em] rounded-full grid place-items-center bg-[var(--color-bg)] text-[var(--color-green)]"><Icon className="h-[1.1em] w-[1.1em]" aria-hidden /></span><span className="leading-tight">{t as string}</span></li>;
              })}
            </ol>
            <p className="mt-[.8vw] text-center text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)]">No phone handy? The host will add you.</p>
          </section>
        )}

        <section className="relative min-h-0 rounded-[2vw] overflow-hidden board-hero grid grid-rows-[auto_minmax(0,1fr)]" data-board-called data-board-hero={hero ? hero.no : ""} data-board-state={ready}>
          <div className="flex items-center justify-between gap-[1vw] px-[1.8vw] pt-[1.4vw]">
            <Eyebrow icon={BellRing} tone="var(--color-green)">{hero ? "Now calling" : next ? "Up next" : "Walk right in"}</Eyebrow>
            {hero?.at && <span className="inline-flex items-center gap-[.4em] text-[clamp(12px,1vw,22px)] font-semibold text-[var(--color-label-2)]" suppressHydrationWarning><Clock3 className="h-[1.1em] w-[1.1em]" aria-hidden />Called {agoText(hero.at, now)}</span>}
          </div>
          <div className={clsx("min-h-0 grid items-center gap-[1.5vw] px-[1.8vw] pb-[1.4vw]", rest.length ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1")}>
            {hero ? (
              <div className={clsx("min-w-0 h-full flex flex-col items-center justify-center text-center gap-[1.1vw]", fresh.has(hero.no) && "board-called-in")} key={hero.no} data-board-no={hero.no}>
                <div className={clsx("board-halo rounded-[1.4vw]", fresh.has(hero.no) && "on")}>
                  <FlapShuffle value={hero.no} pad={0} size="sm" tile="clamp(120px, 14vw, 320px)" tone="live" bare say={`number ${hero.no}`} />
                </div>
                <div className="flex flex-wrap justify-center items-center gap-[.7vw] text-[clamp(16px,1.6vw,34px)] font-extrabold">
                  <span className="inline-flex items-center gap-[.4em] rounded-full px-[.9em] py-[.35em] bg-[var(--color-fill)]"><Users className="h-[1em] w-[1em]" aria-hidden />Party of {hero.party}</span>
                  {hero.table && <span className="inline-flex items-center gap-[.4em] rounded-full px-[.9em] py-[.35em] bg-[var(--color-green)] text-[var(--color-on-tint)]"><Armchair className="h-[1em] w-[1em]" aria-hidden />Table {hero.table}</span>}
                </div>
                <p className="text-[clamp(14px,1.3vw,30px)] font-semibold text-[var(--color-label-2)]">Please come to the host stand</p>
              </div>
            ) : next ? (
              <div className="min-w-0 h-full flex flex-col items-center justify-center text-center gap-[1.1vw]" data-board-no={next.no}>
                <div className="rounded-[1.4vw] p-[.6vw] border-[.22vw] border-dashed border-[var(--color-line-2)]">
                  <FlapShuffle value={next.no} pad={0} size="sm" tile="clamp(120px, 14vw, 320px)" bare say={`next is number ${next.no}`} />
                </div>
                <p className="text-[clamp(16px,1.6vw,34px)] font-extrabold">Party of {next.party} · waiting {waitedText(next.since, now)}</p>
                <p className="text-[clamp(14px,1.3vw,30px)] font-semibold text-[var(--color-label-2)]">Your number lights up here when your table is ready</p>
              </div>
            ) : (
              <div className="min-w-0 h-full flex flex-col items-center justify-center text-center gap-[1vw]">
                <div className="text-[clamp(36px,4.4vw,96px)] font-black tracking-tight leading-none">No wait right now</div>
                <p className="text-[clamp(16px,1.4vw,30px)] font-semibold text-[var(--color-label-2)]">The host will seat you straight away</p>
              </div>
            )}
            {/* the numbers called before this one — still ready, each with its table large, so a guest who missed the call finds it */}
            {rest.length > 0 && (
              <aside className="self-stretch flex flex-col justify-center gap-[.7vw] pl-[1.5vw] border-l border-[color-mix(in_srgb,var(--color-green)_30%,transparent)]" data-board-also>
                <div className="text-[clamp(11px,.95vw,20px)] font-bold uppercase tracking-[.18em] text-[var(--color-label-2)]">Also ready</div>
                {rest.slice(0, ALSO).map((c) => (
                  <div key={c.no} className={clsx("rounded-[1vw] px-[1vw] py-[.6vw] flex items-center gap-[1vw] leading-none bg-[color-mix(in_srgb,var(--color-green)_16%,transparent)] border border-[color-mix(in_srgb,var(--color-green)_40%,transparent)]", fresh.has(c.no) && "screen-fresh")} data-board-no={c.no}>
                    <Num n={c.no} className="text-[clamp(30px,3.2vw,70px)] text-[var(--color-green)] min-w-[1.3em] text-center" />
                    <span className="flex flex-col gap-[.35vw]">
                      {c.table ? <span className="text-[clamp(14px,1.3vw,28px)] font-extrabold inline-flex items-center gap-[.35em]"><Armchair className="h-[1em] w-[1em]" aria-hidden />Table {c.table}</span>
                        : <span className="text-[clamp(14px,1.3vw,28px)] font-extrabold">Host stand</span>}
                      <span className="text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)] inline-flex items-center gap-[.35em]"><Users className="h-[1.1em] w-[1.1em]" aria-hidden />Party of {c.party}</span>
                    </span>
                  </div>))}
                {rest.length > ALSO && <div className="text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)]">+{rest.length - ALSO} more at the host stand</div>}
              </aside>
            )}
          </div>
        </section>
      </main>

      {/* ── the strip: who is waiting, in order, each against the minutes they were told ── */}
      <section className="shrink-0 rounded-[2vw] px-[1.5vw] py-[1.1vw] board-glass" data-board-waiting>
        <div className="flex items-center gap-[.7vw]">
          <Eyebrow icon={Hourglass} tone="var(--color-orange)">Waiting</Eyebrow>
          <span className="rounded-full px-[.7em] py-[.15em] text-[clamp(12px,1vw,22px)] font-bold tabular-nums bg-[var(--color-fill)]">{waiting.length}</span>
          {typical != null && waiting.length > 0 && <span className="ml-[.6vw] inline-flex items-center gap-[.4em] text-[clamp(12px,1vw,22px)] font-semibold text-[var(--color-label-2)]" data-board-typical={typical}><Timer className="h-[1.1em] w-[1.1em]" aria-hidden />Joining now · about {typical} min</span>}
          <span className="ml-auto text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)]">In order of arrival</span>
        </div>
        <div className="mt-[.8vw] flex items-stretch gap-[.7vw] overflow-hidden">
          {strip.map((w, i) => {
            const wl = waitLeft(w, now);
            const tone = i === 0 ? "var(--color-orange)" : wl.soon ? "var(--color-green)" : "var(--color-label-2)";
            return (
              <div key={w.no} className={clsx("shrink-0 w-[clamp(150px,13.5vw,300px)] rounded-[1.2vw] px-[1vw] pt-[.7vw] pb-[.8vw] flex flex-col gap-[.5vw] leading-none bg-[var(--color-fill)] border border-transparent",
                i === 0 && "!bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] !border-[color-mix(in_srgb,var(--color-orange)_55%,transparent)]")} data-board-no={w.no} data-board-left={wl.left}>
                <div className="flex items-center justify-between gap-[.6vw]">
                  <Num n={w.no} className={clsx("text-[clamp(32px,3.4vw,76px)]", i === 0 && "text-[var(--color-orange)]")} />
                  <span className="flex flex-col items-end gap-[.35vw] text-[clamp(11px,.95vw,20px)] font-bold text-[var(--color-label-2)]">
                    <span className="inline-flex items-center gap-[.35em]"><Users className="h-[1.1em] w-[1.1em]" aria-hidden />{w.party}</span>
                    <span className="tabular-nums font-semibold" suppressHydrationWarning>{waitedText(w.since, now)}</span>
                  </span>
                </div>
                <div className="h-[.35vw] min-h-[3px] rounded-full bg-[var(--color-fill-2)] overflow-hidden" aria-hidden><div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(wl.share * 100)}%`, background: tone }} /></div>
                <div className="flex items-center justify-between gap-[.6vw] whitespace-nowrap text-[clamp(10.5px,.9vw,19px)] font-bold uppercase tracking-[.12em]" style={{ color: tone }}>
                  <span className="inline-flex items-center gap-[.2em]">{i === 0 ? <>Next<ChevronRight className="h-[1em] w-[1em]" aria-hidden /></> : wl.soon ? "Soon" : "Waiting"}</span>
                  <span className="normal-case tracking-normal tabular-nums" suppressHydrationWarning>{w.held ? "any minute" : w.quoted == null ? "" : wl.left <= 0 ? "any minute" : `~${wl.left} min`}</span>
                </div>
              </div>);
          })}
          {more > 0 && <div className="shrink-0 rounded-[1.2vw] px-[1.2vw] grid place-items-center text-[clamp(14px,1.2vw,26px)] font-bold text-[var(--color-label-2)] bg-[var(--color-fill)]">+{more} more</div>}
          {waiting.length === 0 && <div className="text-[clamp(14px,1.2vw,26px)] font-semibold text-[var(--color-label-2)] py-[.6vw]">No one waiting — walk right in</div>}
        </div>
      </section>

      <footer className="shrink-0 flex items-center justify-between gap-[1vw] text-[clamp(11px,.95vw,20px)] font-semibold text-[var(--color-label-2)]">
        <span>{feed.name} · Please approach the host stand for assistance</span>
        <span>Numbers are called here and on your phone</span>
      </footer>
    </div>
  );
}
