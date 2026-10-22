"use client";
/* eslint-disable @next/next/no-img-element -- logos and dish photos are the property's own uploads on any host; a plain img keeps these pages free of next/image remote patterns */
import { useState, useTransition } from "react";
import { Star, Check, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { GuestNotice } from "@/components/legal/GuestNotice";
import { sendFeedback } from "../actions";

const WORD = ["", "Very poor", "Poor", "Okay", "Good", "Loved it"];
/** What stood out — the list changes with the score, so a one-star guest is not offered "Great taste". */
const GOOD = ["Great taste", "Quick service", "Friendly staff", "Clean place", "Good value", "Nice ambience"];
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

          <div className="mt-6 flex justify-between gap-1" role="radiogroup" aria-label="Your rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""} — ${WORD[n]}`} onClick={() => pick(n)} data-star={n}
                className="flex-1 min-w-0 !min-h-16 rounded-2xl grid place-items-center hover:bg-[var(--color-fill)] transition-transform active:scale-90">
                <Star size={44} strokeWidth={1.6} aria-hidden className={clsx("transition-colors", n <= rating ? "fill-[var(--color-orange)] text-[var(--color-orange)]" : "text-[var(--color-label-3)]")} />
              </button>))}
          </div>
          <div className="mt-1 h-6 text-center text-[15px] font-bold" style={{ color: rating ? "var(--color-orange)" : undefined }}>{WORD[rating]}</div>

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
              <label className="min-w-0"><span className="text-[13px] font-semibold text-[var(--color-label-2)]">Phone (optional)</span><input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" className="mt-1.5 w-full h-12 rounded-xl border px-3 text-[16px]" autoComplete="tel" /></label>
            </div>
            {rating <= 3 && <p className="mt-2 text-[12.5px] text-[var(--color-label-2)]">Leave a number and the manager can call you back.</p>}
            {err && <p className="mt-4 text-[14px] font-semibold text-[var(--color-red)]" role="alert" data-feedback-error>{err}</p>}
            <button type="button" onClick={send} disabled={pending} data-feedback-send
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
