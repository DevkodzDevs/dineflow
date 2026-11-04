"use client";
import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Field, cn } from "@/components/ui";

const hrs = (m: number) => { const h = m / 60; return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1).replace(/\.0$/, "")} h`; };

/**
 * Settings → Rooms & stays → Late check-out (0171). A guest still in after the check-out time: up to `half` free, then half a
 * night, past `full` a whole night, and a night for each further 24 hours, at the stay's own rate, on the room bill (taxed as
 * the room). The bands are drawn under the two boxes as they are typed. Saved by saveRestaurant as minutes.
 * The boxes are uncontrolled (defaultValue / defaultChecked): Settings saves through a form action, and React resets the form
 * after it — a controlled box was put back to its first value on screen while the saved row said otherwise. The state here
 * only draws the bands; it is read back from the boxes when the form resets.
 */
export function LateCheckoutRule({ on: on0, half: half0, full: full0 }: { on: boolean; half: number; full: number }) {
  const [on, setOn] = useState(on0);
  const [half, setHalf] = useState(half0 / 60);
  const [full, setFull] = useState(full0 / 60);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form"); if (!form) return;
    const sync = () => window.setTimeout(() => {
      const el = ref.current; if (!el) return;
      const box = (n: string) => el.querySelector<HTMLInputElement>(`input[name="${n}"]:not([type=hidden])`);
      const c = box("late_checkout_on"), a = box("late_half_after_h"), b = box("late_full_after_h");
      if (c) setOn(c.checked); if (a) setHalf(Number(a.value)); if (b) setFull(Number(b.value));
    }, 0);
    form.addEventListener("reset", sync);
    return () => form.removeEventListener("reset", sync);
  }, []);
  const h = Math.max(0, Math.min(23.5, half || 0)), f = Math.max(h, Math.min(23.5, full || 0));
  const bands = [
    { k: "free", when: `Up to ${hrs(h * 60)}`, what: "Free", tone: "var(--color-green)" },
    { k: "half", when: `${hrs(h * 60)} – ${hrs(f * 60)}`, what: "½ night", tone: "var(--color-orange)" },
    { k: "full", when: `Over ${hrs(f * 60)}`, what: "1 night", tone: "var(--color-red)" },
  ];
  return (
    <div ref={ref} className="mt-4 rounded-[16px] bg-[var(--color-fill)] p-3.5 min-w-0" data-late-rule>
      <label className="flex items-start gap-2.5 normal-case tracking-normal text-sm">
        <input type="checkbox" name="late_checkout_on" className="mt-0.5" defaultChecked={on0} onChange={(e) => setOn(e.target.checked)} />
        <span><span className="inline-flex items-center gap-1.5 font-semibold"><Clock size={14} aria-hidden /> Charge late check-out</span>
          <span className="block text-xs text-steel mt-0.5">Added to the room bill</span></span>
      </label>
      <div className={cn("mt-3 grid grid-cols-2 gap-2 min-w-0", !on && "opacity-50")}>
        <Field label="Half night after" hint="Hours late">
          <input name="late_half_after_h" type="number" min={0} max={23.5} step={0.5} inputMode="decimal" className="num" disabled={!on}
            defaultValue={half0 / 60} onChange={(e) => setHalf(Number(e.target.value))} />
        </Field>
        <Field label="Full night after" hint="Hours late">
          <input name="late_full_after_h" type="number" min={0} max={23.5} step={0.5} inputMode="decimal" className="num" disabled={!on}
            defaultValue={full0 / 60} onChange={(e) => setFull(Number(e.target.value))} />
        </Field>
      </div>
      {/* disabled boxes are not sent: keep what is saved while it is off */}
      {!on && <><input type="hidden" name="late_half_after_h" value={half0 / 60} /><input type="hidden" name="late_full_after_h" value={full0 / 60} /></>}
      {on && (
        <ol className="mt-3 grid grid-cols-3 gap-1.5 min-w-0" aria-label="Late check-out charges" data-late-bands>
          {bands.map((b) => (
            <li key={b.k} className="min-w-0 rounded-[12px] bg-[var(--color-bg-2)] px-2.5 py-2" data-late-band={b.k}>
              <div className="text-[11.5px] text-steel num truncate">{b.when}</div>
              <div className="text-[13.5px] font-bold truncate" style={{ color: b.tone }}>{b.what}</div>
            </li>
          ))}
        </ol>
      )}
      {on && <p className="text-xs text-steel mt-2">Each extra day: 1 night</p>}
    </div>
  );
}
