/**
 * The arithmetic behind the flap numbers (components/ui/Flap.tsx, 2026-10-20) — kept pure so it is tested.
 *
 * shuffleFrame: while a number settles, each character position shows a random digit (or letter) until its turn comes,
 * left to right — position i lands on step 3 + i. clockText / clockTone: a ticking age in tiles, and its colour.
 */
const DIGITS = "0123456789", LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** How many steps a value takes to settle: the last position lands on step 3 + (length − 1). */
export const settleSteps = (target: string) => 3 + Math.max(0, target.length - 1);

/** The string shown on `step` of a settle towards `target`. Digits shuffle through digits and letters through letters;
 *  anything else (":", "/", "%", "#", a space) is shown as it is from the first step. `rand` is 0–1 (Math.random). */
export function shuffleFrame(target: string, step: number, rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (step >= 3 + i) { out += ch; continue; }
    out += /\d/.test(ch) ? DIGITS[Math.floor(rand() * 10) % 10] : /[A-Z]/i.test(ch) ? LETTERS[Math.floor(rand() * 26) % 26] : ch;
  }
  return out;
}

/** A count from `from` to `to` in `steps` even steps (the percent counter); the last is exactly `to`. */
export function countFrames(from: number, to: number, steps = 8): number[] {
  if (from === to || steps < 1) return [to];
  return Array.from({ length: steps }, (_, i) => (i === steps - 1 ? to : Math.round(from + ((to - from) * (i + 1)) / steps)));
}

/** An age in tiles: under an hour "mm:ss", from an hour "h:mm" (a ticket left on the pass for 75 minutes reads 1:15). */
export function clockText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 3600) return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const m = Math.floor(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** The colour of an age against the kitchen's hurry and late minutes: live, then amber at hurry, red at late. */
export function clockTone(ms: number, hurry?: number | null, late?: number | null): "live" | "warn" | "alert" | undefined {
  if (hurry == null && late == null) return undefined;
  const min = ms / 60000;
  if (late != null && min >= late) return "alert";
  if (hurry != null && min >= hurry) return "warn";
  return "live";
}

/** "13:00" or "13:00:00" (a Postgres time) → the 12-hour face and its half: ["1:00", "PM"]. */
export function twelveHour(time: string): [string, "AM" | "PM"] {
  const [h, m] = time.split(":").map(Number);
  const half = h >= 12 ? "PM" : "AM";
  return [`${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, "0")}`, half];
}
