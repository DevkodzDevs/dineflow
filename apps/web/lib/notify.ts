/**
 * Notifications on this device: which events it announces, with which tone, how loud, and whether
 * it also shows a system notification while DineFlow is in the background.
 *
 * Settings belong to the machine, not the person (localStorage "df-notify"): the kitchen screen
 * wants a loud ticket beep for every KOT, the front desk a bell for bookings, the owner's phone a
 * soft pop for everything. A device that has never been set up picks a station from what it is
 * (a phone, a hotel's desk, a restaurant's till) — see `guessStation`.
 */

export type NotifyKind = "online" | "reservation" | "booking" | "kot" | "ready" | "housekeeping";
export type ToneId = "chime" | "bell" | "ticket" | "pop" | "marimba" | "rush";
export type StationId = "front" | "kitchen" | "till" | "phone" | "custom";

export type NotifyPrefs = {
  on: boolean;            // sound and in-app alerts at all
  station: StationId;
  tone: ToneId;
  volume: number;         // 0–100
  system: boolean;        // also a system notification while the app is in the background
  kinds: Record<NotifyKind, boolean>;
};

/** What each event is called, which section it opens, and the module that must be switched on. */
export const KINDS: { kind: NotifyKind; label: string; hint: string; href: string; module: string }[] = [
  { kind: "online", label: "New online orders", hint: "Swiggy, Zomato and your own storefront", href: "/online-orders", module: "online-orders" },
  { kind: "reservation", label: "New table bookings", hint: "From the storefront or a phone booking", href: "/reservations", module: "reservations" },
  { kind: "booking", label: "New room bookings", hint: "Direct, walk-in or from an OTA", href: "/frontdesk", module: "frontdesk" },
  { kind: "kot", label: "New kitchen tickets", hint: "Every KOT the moment it is fired", href: "/kitchen", module: "kitchen" },
  { kind: "ready", label: "Food ready to serve", hint: "When the kitchen marks a ticket ready", href: "/orders", module: "orders" },
  { kind: "housekeeping", label: "Rooms to clean", hint: "A new housekeeping task", href: "/housekeeping", module: "housekeeping" },
];

export const TONES: { id: ToneId; label: string; hint: string }[] = [
  { id: "chime", label: "Chime", hint: "Three bright notes" },
  { id: "bell", label: "Desk bell", hint: "One clear ring" },
  { id: "ticket", label: "Ticket beep", hint: "Loud double beep, cuts through a kitchen" },
  { id: "pop", label: "Soft pop", hint: "Quiet, for a phone in a pocket" },
  { id: "marimba", label: "Marimba", hint: "Warm two-note" },
  { id: "rush", label: "Rush", hint: "Three rising beeps, hard to miss" },
];

const ALL: Record<NotifyKind, boolean> = { online: true, reservation: true, booking: true, kot: true, ready: true, housekeeping: true };
const NONE: Record<NotifyKind, boolean> = { online: false, reservation: false, booking: false, kot: false, ready: false, housekeeping: false };

/** A station is a sensible starting point for a kind of machine; changing anything makes it Custom. */
export const STATIONS: { id: StationId; label: string; hint: string; tone: ToneId; kinds: Record<NotifyKind, boolean> }[] = [
  { id: "front", label: "Front desk", hint: "Bookings, table bookings, online orders", tone: "bell", kinds: { ...NONE, booking: true, reservation: true, online: true, housekeeping: true } },
  { id: "kitchen", label: "Kitchen screen", hint: "Every ticket and online order, loud", tone: "ticket", kinds: { ...NONE, kot: true, online: true } },
  { id: "till", label: "Till / waiters", hint: "Food ready, table bookings, online orders", tone: "chime", kinds: { ...NONE, ready: true, reservation: true, online: true } },
  { id: "phone", label: "Owner's phone", hint: "Everything, softly", tone: "pop", kinds: { ...ALL } },
];

export function guessStation(propertyType: string): StationId {
  if (typeof window === "undefined") return "phone";
  const phone = window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (phone) return "phone";
  return propertyType === "restaurant" ? "till" : "front";
}

export function stationPrefs(id: StationId, keep?: Partial<NotifyPrefs>): NotifyPrefs {
  const s = STATIONS.find((x) => x.id === id) ?? STATIONS[3];
  return { on: true, system: false, volume: 80, ...keep, station: s.id, tone: s.tone, kinds: { ...s.kinds } };
}

const KEY = "df-notify";
export function loadPrefs(propertyType: string): NotifyPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw) as NotifyPrefs; if (p && p.kinds && p.tone) return { ...stationPrefs("phone"), ...p, kinds: { ...NONE, ...p.kinds } }; }
  } catch { /* storage blocked: fall through to the guess */ }
  return stationPrefs(guessStation(propertyType));
}
export function savePrefs(p: NotifyPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: lasts this visit */ }
  try { window.dispatchEvent(new CustomEvent("df-notify-prefs", { detail: p })); } catch { /* old browser */ }
}

/* ── tones ─────────────────────────────────────────────────────────────────────────────────────
   Synthesised with WebAudio, so there are no sound files to load or cache offline. A browser only
   lets a page make sound after someone has touched it, so `unlockAudio` runs on the first tap. */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}
export function unlockAudio() { const c = audio(); if (c && c.state === "suspended") void c.resume().catch(() => {}); }
export const audioBlocked = () => { const c = audio(); return !c || c.state !== "running"; };

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number; glide?: number };
const PATTERNS: Record<ToneId, Note[]> = {
  chime: [{ f: 1046.5, at: 0, dur: .32 }, { f: 1318.5, at: .12, dur: .32 }, { f: 1568, at: .24, dur: .6 }],
  bell: [{ f: 880, at: 0, dur: 1.4 }, { f: 1760, at: 0, dur: .9, gain: .35 }, { f: 2637, at: 0, dur: .5, gain: .15 }],
  ticket: [{ f: 1318.5, at: 0, dur: .14, type: "square", gain: .55 }, { f: 1318.5, at: .2, dur: .14, type: "square", gain: .55 }, { f: 1318.5, at: .55, dur: .14, type: "square", gain: .55 }, { f: 1318.5, at: .75, dur: .14, type: "square", gain: .55 }],
  pop: [{ f: 620, at: 0, dur: .16, type: "triangle", glide: 980 }],
  marimba: [{ f: 784, at: 0, dur: .45, type: "triangle" }, { f: 1175, at: .16, dur: .6, type: "triangle" }],
  rush: [{ f: 880, at: 0, dur: .12, type: "sawtooth", gain: .4 }, { f: 1175, at: .16, dur: .12, type: "sawtooth", gain: .4 }, { f: 1568, at: .32, dur: .22, type: "sawtooth", gain: .4 }],
};

export function playTone(tone: ToneId, volume = 80) {
  const c = audio(); if (!c) return;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const master = c.createGain(); master.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.5; master.connect(c.destination);
  const t0 = c.currentTime + 0.02;
  for (const n of PATTERNS[tone] ?? PATTERNS.chime) {
    const o = c.createOscillator(); const g = c.createGain();
    o.type = n.type ?? "sine"; o.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.glide) o.frequency.exponentialRampToValueAtTime(n.glide, t0 + n.at + n.dur);
    const peak = n.gain ?? 1;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    o.connect(g); g.connect(master); o.start(t0 + n.at); o.stop(t0 + n.at + n.dur + 0.05);
  }
}
