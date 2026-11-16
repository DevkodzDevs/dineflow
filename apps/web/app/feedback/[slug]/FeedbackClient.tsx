"use client";
import { okPhone } from "@/lib/phone";
import { PhoneInput } from "@/components/ui/PhoneInput";   // the box alone: this page keeps the kit out of its bundle
/* eslint-disable @next/next/no-img-element -- logos and dish photos are the property's own uploads on any host; a plain img keeps these pages free of next/image remote patterns */
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { GuestNotice } from "@/components/legal/GuestNotice";
import { sendFeedback } from "../actions";
import { starTone } from "@/lib/touches";

const WORD = ["", "Very poor", "Poor", "Okay", "Good", "Loved it"];
/** What stood out — the list changes with the score, so a one-star guest is not offered "Great taste". */
const GOOD = ["Great taste", "Quick service", "Friendly staff", "Clean place", "Good value", "Nice ambience"];
/** The five stars' places in the sky (a 304 × 112 box), a five-point star 19 wide, and the dust behind them. */
const STAR_PTS: [number, number][] = [[36, 68], [94, 40], [152, 62], [210, 36], [268, 58]];
const STAR_D = "M0,-19 L4.9,-6.8 L18.1,-5.9 L8,2.6 L11.2,15.4 L0,8.4 L-11.2,15.4 L-8,2.6 L-18.1,-5.9 L-4.9,-6.8 Z";
const DUST = Array.from({ length: 44 }, (_, i) => ({ x: 4 + ((i * 71) % 296), y: 4 + ((i * 37) % 104), r: 0.5 + (i % 3) * 0.4, o: 0.18 + (i % 4) * 0.14 }));
const BAD = ["Slow service", "Cold food", "Taste", "Wrong order", "Cleanliness", "Rude staff", "Too costly", "Noise"];

/**
 * Five big stars first — one tap is a complete answer — then, if they like, what stood out, a line, and a name and
 * phone so the manager can call back. The score goes only to the property; three stars or fewer raise an alert on
 * the staff's screens.
 */
export function FeedbackClient({ slug, table, place }: { slug: string; table: string | null; place: { name: string; logo: string | null; table: string | null } }) {
  const [rating, setRating] = useState(0); const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState(""); const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false); const [pending, start] = useTransition();
  const [peek, setPeek] = useState(0);   // a mouse resting on a star lights the sky up to it; a tap decides
  const lit = peek || rating;
  const choices = rating === 0 ? [] : rating >= 4 ? GOOD : BAD;
  const pick = (n: number) => { if ((n >= 4) !== (rating >= 4)) setTags([]); setRating(n); setErr(null); };
  const toggle = (t: string) => setTags((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));
  const send = () => start(async () => {
    const r = await sendFeedback(slug, table, rating, tags, comment.trim(), name.trim(), phone.trim());
    if ("error" in r) setErr(r.error!); else setDone(true);
  });

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 py-8 sm:py-14">
      <div className="flex items-center gap-3 mb-7">
        {place.logo ? <img src={place.logo} alt="" className="h-12 w-12 rounded-2xl object-cover" /> : <div className="h-12 w-12 rounded-2xl bg-[var(--color-fill)] grid place-items-center font-black text-lg">{place.name.slice(0, 1)}</div>}
        <div className="min-w-0"><div className="text-[18px] font-extrabold truncate">{place.name}</div>{place.table && <div className="text-[13px] text-[var(--color-label-2)]">{place.table}</div>}</div>
      </div>

      {done ? (
        <div className="rounded-[24px] bg-white border border-[var(--color-separator)] p-7 text-center" data-feedback-done>
          <div className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><Check size={32} strokeWidth={3} aria-hidden /></div>
          <div className="mt-4 text-[22px] font-extrabold">Thank you!</div>
          <p className="mt-1.5 text-[15px] text-[var(--color-label-2)]">{rating >= 4 ? "We are glad you enjoyed it. See you again soon." : "Sorry it wasn't right. The manager reads every note" + (phone ? " and will call you." : ".")}</p>
        </div>
      ) : (
        <div className="rounded-[24px] bg-white border border-[var(--color-separator)] p-5 sm:p-7" data-feedback-form>
          <div role="heading" aria-level={1} className="text-[24px] leading-tight font-extrabold">How was your meal?</div>
          <p className="mt-1 text-[14px] text-[var(--color-label-2)]">One tap is enough. Only {place.name} sees this.</p>

          {/* the stars draw a constellation (2026-11-16, the owner's video): a night sky in the white card, five stars that join
              up as they light — coral for a complaint, amber for okay, blue for a good night — the word and the score under
              them. The taps are the same five radios as before, laid over the sky, a fifth of it each and never under 44px. */}
          <div className="fb-sky mt-6" data-tone={starTone(lit)} data-rating={rating} data-feedback-sky>
            <svg viewBox="0 0 304 112" aria-hidden className="fb-sky-svg">
              {DUST.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} opacity={d.o} className="fb-dust" />)}
              {STAR_PTS.slice(1).map((p, i) => <line key={i} x1={STAR_PTS[i][0]} y1={STAR_PTS[i][1]} x2={p[0]} y2={p[1]} className="fb-line" data-lit={i + 1 < lit || undefined} />)}
              {STAR_PTS.map(([x, y], i) => (
                <g key={i} transform={`translate(${x} ${y})`} className="fb-star" data-lit={i < lit || undefined} data-last={i === lit - 1 || undefined}>
                  <circle r="24" className="fb-halo" /><circle r="29" className="fb-ring" /><path d={STAR_D} className="fb-shape" />
                </g>))}
            </svg>
            <div className="fb-taps" role="radiogroup" aria-label="Your rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""} — ${WORD[n]}`} onClick={() => pick(n)} data-star={n}
                  onPointerEnter={(e) => { if (e.pointerType === "mouse") setPeek(n); }} onPointerLeave={() => setPeek(0)} />))}
            </div>
            <div className="fb-row"><b data-feedback-word>{lit ? WORD[lit] : "Tap a star"}</b><span className="num">{lit ? `${lit}.0` : "–"}<small> / 5</small></span></div>
          </div>

          {rating > 0 && <>
            <div className="mt-5 text-[13px] font-bold uppercase tracking-wide text-[var(--color-label-2)]">{rating >= 4 ? "What did you like?" : "What went wrong?"}</div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {choices.map((t) => (
                <button key={t} type="button" aria-pressed={tags.includes(t)} onClick={() => toggle(t)} data-tag
                  className={clsx("!min-h-11 px-4 rounded-full text-[14px] font-semibold border transition-colors",
                    tags.includes(t) ? "bg-[var(--color-label)] text-[var(--color-bg)] border-transparent" : "bg-[var(--color-bg)] border-[var(--color-separator)]")}>{t}</button>))}
            </div>
            <label className="block mt-5"><span className="text-[13px] font-bold uppercase tracking-wide text-[var(--color-label-2)]">Anything else? <span className="normal-case font-medium">(optional)</span></span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={600} rows={3} className="mt-2 w-full rounded-2xl border p-3 text-[16px]" placeholder={rating >= 4 ? "Tell us what made it good" : "Tell us what happened — we will fix it"} />
            </label>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <label className="min-w-0"><span className="text-[13px] font-semibold text-[var(--color-label-2)]">Name (optional)</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mt-1.5 w-full h-12 rounded-xl border px-3 text-[16px]" autoComplete="name" /></label>
              <label className="min-w-0"><span className="text-[13px] font-semibold text-[var(--color-label-2)]">Phone (optional)</span><PhoneInput value={phone} onValue={setPhone} className="mt-1.5 w-full h-12 rounded-xl border px-3 text-[16px]" /></label>
            </div>
            {rating <= 3 && <p className="mt-2 text-[12.5px] text-[var(--color-label-2)]">Leave a number and the manager can call you back.</p>}
            {err && <p className="mt-4 text-[14px] font-semibold text-[var(--color-red)]" role="alert" data-feedback-error>{err}</p>}
            <button type="button" onClick={send} disabled={pending || !okPhone(phone)} data-feedback-send
              className="mt-5 w-full !min-h-14 rounded-2xl text-[17px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "var(--color-tint)", color: "var(--color-on-tint, #fff)" }}>
              {pending && <Loader2 size={18} className="animate-spin" aria-hidden />}Send feedback
            </button>
            <GuestNotice property={place.name} use="to read your feedback and call you back if you leave a number" className="mt-4" />
          </>}
        </div>
      )}
    </main>
  );
}
