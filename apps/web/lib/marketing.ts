/**
 * Marketing ideas from a property's own last 30 days. `salesFacts` turns raw orders and lines into
 * the few numbers a campaign is built on; `readyIdeas` writes campaigns from those numbers without
 * any AI (used when there is no key, and as the shape the AI must return). Every idea names an
 * audience the Customers screen already filters by, so "send to" is a list it can already draw.
 */
export type Audience = "all" | "regulars" | "lapsed" | "new" | "points";
export type Idea = { title: string; why: string; audience: Audience; offer: string; when: string; message: string };
export type Facts = {
  orders: number; avg_ticket: number; top: { name: string; qty: number }[]; slow: { name: string; qty: number }[];
  slowest_day: string | null; busiest_day: string | null; slow_daypart: "lunch" | "dinner" | null;
  customers: number; lapsed: number; new_30d: number; regulars: number; with_points: number;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function salesFacts(
  orders: { id: string; created_at: string; total?: number | null }[],
  lines: { name: string; qty: number }[],
  people: { customers: number; lapsed: number; new_30d: number; regulars: number; with_points: number },
): Facts {
  const byDay = Array(7).fill(0) as number[]; let lunch = 0, dinner = 0, spend = 0, priced = 0;
  for (const o of orders) {
    const t = new Date(new Date(o.created_at).getTime() + 5.5 * 3600e3); // IST
    byDay[t.getUTCDay()]++;
    const h = t.getUTCHours(); if (h >= 11 && h < 16) lunch++; else if (h >= 18 && h < 24) dinner++;
    if (o.total != null) { spend += Number(o.total); priced++; }
  }
  const qty = new Map<string, number>(); for (const l of lines) qty.set(l.name, (qty.get(l.name) ?? 0) + Number(l.qty));
  const ranked = [...qty.entries()].map(([name, q]) => ({ name, qty: q })).sort((a, b) => b.qty - a.qty);
  const days = byDay.map((n, i) => ({ n, d: DAYS[i] }));
  return {
    orders: orders.length, avg_ticket: priced ? Math.round(spend / priced) : 0,
    top: ranked.slice(0, 5), slow: ranked.length > 8 ? ranked.slice(-3).reverse() : [],
    slowest_day: orders.length >= 14 ? [...days].sort((a, b) => a.n - b.n)[0].d : null,
    busiest_day: orders.length >= 14 ? [...days].sort((a, b) => b.n - a.n)[0].d : null,
    slow_daypart: lunch + dinner >= 20 ? (lunch * 1.5 < dinner ? "lunch" : dinner * 1.5 < lunch ? "dinner" : null) : null,
    ...people,
  };
}

/** Campaigns written from the numbers alone. `{name}` in a message becomes the guest's first name. */
export function readyIdeas(f: Facts, place: string): Idea[] {
  const out: Idea[] = [];
  if (f.lapsed > 0) out.push({ title: "Bring back the regulars you have not seen", audience: "lapsed",
    why: `${f.lapsed} guest${f.lapsed === 1 ? "" : "s"} came at least twice but not in the last 60 days.`,
    offer: "15% off their next visit, code COMEBACK15", when: "Send this week, valid 14 days",
    message: `Hi {name}, it has been a while since we saw you at ${place}. Come in this fortnight and show code COMEBACK15 for 15% off your bill.${f.top[0] ? ` The ${f.top[0].name} is still on.` : ""}` });
  if (f.slowest_day && f.slowest_day !== f.busiest_day) out.push({ title: `Fill your ${f.slowest_day}s`, audience: "all",
    why: `${f.slowest_day} is your quietest day of the week; ${f.busiest_day} is your busiest.`,
    offer: `${f.top[0] ? `A free dessert with any ${f.top[0].name}` : "A free dessert with any main"} on ${f.slowest_day}s`, when: `Send on the ${DAYS[(DAYS.indexOf(f.slowest_day) + 6) % 7]} before`,
    message: `Hi {name}, ${f.slowest_day}s are quieter at ${place}, so we are keeping a table and a free dessert for you this ${f.slowest_day}. Just mention this message.` });
  if (f.slow_daypart) out.push({ title: f.slow_daypart === "lunch" ? "A quick lunch that brings people in" : "Give the evening a reason", audience: "regulars",
    why: f.slow_daypart === "lunch" ? "Your lunches are far quieter than your dinners." : "Your evenings are far quieter than your lunches.",
    offer: f.slow_daypart === "lunch" ? "A fixed lunch plate, out in 15 minutes" : "A family dinner combo for four", when: "Weekdays for a month",
    message: f.slow_daypart === "lunch" ? `Hi {name}, ${place} now does a fixed lunch plate on weekdays, on your table in 15 minutes. Good for a work day.` : `Hi {name}, ${place} has a family dinner for four on weekday evenings. Reply here and we will keep a table.` });
  if (f.with_points > 0) out.push({ title: "Remind guests their points are waiting", audience: "points",
    why: `${f.with_points} guest${f.with_points === 1 ? " has" : "s have"} enough points to spend and may not know it.`,
    offer: "Points off the bill on the next visit", when: "Any time",
    message: `Hi {name}, you have points waiting at ${place}. They come off your bill on your next visit, no code needed.` });
  if (f.new_30d > 0 && out.length < 4) out.push({ title: "Turn first-timers into regulars", audience: "new",
    why: `${f.new_30d} guest${f.new_30d === 1 ? "" : "s"} visited for the first time this month.`,
    offer: "10% off a second visit within three weeks", when: "A week after their first visit",
    message: `Hi {name}, thank you for coming to ${place}. Come back within three weeks and we will take 10% off. Just show this message.` });
  return out.slice(0, 4);
}

/** The audience, from the same rules the Customers filter chips use. */
export function inAudience(a: Audience, c: { visits: number; last_visit_at: string | null; first_visit_at: string | null; points: number }, minRedeem: number, now = Date.now()) {
  const days = (iso: string | null) => (iso ? Math.round((now - new Date(iso).getTime()) / 86400000) : null);
  if (a === "regulars") return c.visits >= 3;
  if (a === "lapsed") { const d = days(c.last_visit_at); return c.visits >= 2 && d !== null && d >= 60; }
  if (a === "new") { const d = days(c.first_visit_at); return d !== null && d <= 30; }
  if (a === "points") return Number(c.points) >= minRedeem;
  return true;
}
