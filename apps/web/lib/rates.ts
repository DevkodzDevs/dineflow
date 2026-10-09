/**
 * A suggested nightly rate for one room type on one date, from what is already on the books.
 *
 * Fuller nights go up, empty nights close in come down, a Friday or Saturday that is filling gets a
 * little more. Always moved off the room type's base rate — never off the current rate, so
 * accepting a suggestion twice does not compound — rounded to ₹50 and kept between 70% and 150%
 * of base. Only the next 14 nights: further out, what is on the books says too little.
 * Null when the change would be under ₹50 or 3%, or the night is closed.
 */
export type RateDay = { stay_date: string; total: number; booked: number; rate: number; stop_sell: boolean };
export type RateHint = { rate: number; pct: number; why: string };

const DAY = 86400000;
export function suggestRate(d: RateDay, base: number, today: string): RateHint | null {
  if (d.stop_sell || d.total <= 0 || base <= 0) return null;
  const out = Math.round((Date.parse(d.stay_date) - Date.parse(today)) / DAY);
  if (out < 0 || out > 13) return null;
  const occ = d.booked / d.total;
  const dow = new Date(`${d.stay_date}T12:00:00Z`).getUTCDay();
  let pct = 0; let why = "";
  if (occ >= 0.9) { pct = 25; why = "nearly full"; }
  else if (occ >= 0.75) { pct = 15; why = "filling fast"; }
  else if (occ >= 0.6) { pct = 8; why = "busier than usual"; }
  else if (out <= 3 && occ < 0.3) { pct = -15; why = "rooms empty, a few days out"; }
  else if (out <= 7 && occ < 0.4) { pct = -10; why = "a slow week"; }
  if ((dow === 5 || dow === 6) && occ >= 0.4) { pct += 5; why = why ? `${why}, weekend` : "weekend"; }
  const rate = Math.min(base * 1.5, Math.max(base * 0.7, Math.round((base * (1 + pct / 100)) / 50) * 50));
  const cur = Number(d.rate) || base;
  if (Math.abs(rate - cur) < Math.max(50, cur * 0.03)) return null;
  return { rate, pct: Math.round(((rate - cur) / cur) * 100), why: why || "back to the usual rate" };
}
