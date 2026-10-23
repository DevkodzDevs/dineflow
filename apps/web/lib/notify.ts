/**
 * Notifications on this device: which events it announces, with which tone, how loud, and whether
 * it also shows a system notification while DineFlow is in the background.
 *
 * Settings belong to the machine, not the person (localStorage "df-notify"): the kitchen screen
 * wants a loud ticket beep for every KOT, the front desk a bell for bookings, the owner's phone a
 * soft pop for everything. A device that has never been set up picks a station from what it is
 * (a phone, a hotel's desk, a restaurant's till) — see `guessStation`.
 */

export type NotifyKind = "online" | "reservation" | "booking" | "kot" | "ready" | "housekeeping" | "call" | "feedback" | "clean" | "assigned" | "roomdone" | "job" | "jobdone" | "taken" | "voice" | "leave";
export type ToneId = "chime" | "bell" | "ticket" | "pop" | "marimba" | "rush";
export type StationId = "front" | "kitchen" | "till" | "phone" | "cleaning" | "custom";

export type NotifyPrefs = {
  on: boolean;            // sound and in-app alerts at all
  station: StationId;
  tone: ToneId;
  volume: number;         // 0–100
  system: boolean;        // also a system notification while the app is in the background
  kinds: Record<NotifyKind, boolean>;
};

/** What each event is called, which section it opens, and the module that must be switched on ("" — anyone). */
export const KINDS: { kind: NotifyKind; label: string; hint: string; href: string; module: string }[] = [
  { kind: "online", label: "New online orders", hint: "Swiggy, Zomato and your own storefront", href: "/online-orders", module: "online-orders" },
  { kind: "reservation", label: "New table bookings", hint: "From the storefront or a phone booking", href: "/reservations", module: "reservations" },
  { kind: "booking", label: "New room bookings", hint: "Direct, walk-in or from an OTA", href: "/frontdesk", module: "frontdesk" },
  { kind: "kot", label: "New kitchen tickets", hint: "Every KOT the moment it is fired", href: "/kitchen", module: "kitchen" },
  { kind: "ready", label: "Food ready to serve", hint: "When the kitchen marks a ticket ready", href: "/orders", module: "orders" },
  { kind: "housekeeping", label: "Rooms to clean", hint: "A new housekeeping task", href: "/housekeeping", module: "housekeeping" },
  { kind: "call", label: "A table calls a waiter", hint: "Waiter, the bill or water — from the table's QR", href: "/orders", module: "orders" },
  { kind: "clean", label: "Tables to clean", hint: "A table paid and left — whoever is free cleans it", href: "/cleaning", module: "orders" },
  { kind: "assigned", label: "A job given to you", hint: "A supervisor gave you a table or a room to clean", href: "/cleaning", module: "" },
  { kind: "roomdone", label: "Rooms cleaned", hint: "A room is done — check it or sell it", href: "/cleaning", module: "housekeeping" },
  { kind: "job", label: "New jobs for your department", hint: "A repair, a guest request or a setup", href: "/work", module: "" },
  { kind: "jobdone", label: "Jobs finished", hint: "Your request or your team's job is done", href: "/work", module: "" },
  { kind: "taken", label: "Jobs taken", hint: "Who took a job in your team, and when", href: "/work", module: "" },
  { kind: "feedback", label: "A low rating", hint: "A guest gave 3 stars or fewer", href: "/customers?tab=feedback", module: "customers" },
  // 0124: the staff's messages to the owner, and the owner's answers to them — everyone, no section needed
  { kind: "voice", label: "Feedback & complaints", hint: "Staff messages to the owner, and the owner's replies", href: "/voice", module: "" },
  // 0127: a leave request for whoever decides it, and the decision for the person who asked
  { kind: "leave", label: "Leave", hint: "A leave request to decide, or the answer to yours", href: "/home", module: "" },
];

/**
 * Which alerts this person can have at all: by the sections they hold — and three by what they do. A cleaner hears
 * tables to clean without holding Orders; only those who sign rooms off or sell them hear that a room is cleaned; a job
 * given to you needs no section.
 */
/** A person's department for the alerts: their position's, else their role's — the database's _my_dept (0116). */
export const ROLE_DEPT: Record<string, string> = { housekeeping: "housekeeping", waiter: "service", cashier: "service", chef: "kitchen", frontdesk: "front_office", store: "stores" };
/** May this person hear about a job of this kind and department? The database's _work_dept_ok (0116), for the rows
 *  RLS does not filter (room tasks). */
export function deptSees(role: string, dept: string | null, kind: "table" | "room" | "job", jobDept: string | null): boolean {
  if (role === "owner" || role === "manager") return true;
  const d = dept ?? ROLE_DEPT[role] ?? null;
  if ((role === "supervisor" || role === "supervisor_2") && !d) return true;
  if (kind === "table") return d === "service" || d === "housekeeping";
  if (kind === "room") return d === "housekeeping";
  return !jobDept || d === jobDept;
}

export function kindsFor(modules: string[], role: string): NotifyKind[] {
  return KINDS.filter((k) => {
    if (k.kind === "clean") return modules.includes("orders") || role === "employee";
    if (k.kind === "roomdone" || k.kind === "taken") return ["owner", "manager", "supervisor", "supervisor_2"].includes(role);
    return !k.module || modules.includes(k.module);
  }).map((k) => k.kind);
}

export const TONES: { id: ToneId; label: string; hint: string }[] = [
  { id: "chime", label: "Chime", hint: "Three bright notes" },
  { id: "bell", label: "Desk bell", hint: "One clear ring" },
  { id: "ticket", label: "Ticket beep", hint: "Loud double beep, cuts through a kitchen" },
  { id: "pop", label: "Soft pop", hint: "Quiet, for a phone in a pocket" },
  { id: "marimba", label: "Marimba", hint: "Warm two-note" },
  { id: "rush", label: "Rush", hint: "Three rising beeps, hard to miss" },
];

const ALL: Record<NotifyKind, boolean> = { online: true, reservation: true, booking: true, kot: true, ready: true, housekeeping: true, call: true, feedback: true, clean: true, assigned: true, roomdone: true, job: true, jobdone: true, taken: true, voice: true, leave: true };
const NONE: Record<NotifyKind, boolean> = { online: false, reservation: false, booking: false, kot: false, ready: false, housekeeping: false, call: false, feedback: false, clean: false, assigned: false, roomdone: false, job: false, jobdone: false, taken: false, voice: false, leave: false };

/** A station is a sensible starting point for a kind of machine; changing anything makes it Custom. */
export const STATIONS: { id: StationId; label: string; hint: string; tone: ToneId; kinds: Record<NotifyKind, boolean> }[] = [
  { id: "front", label: "Front desk", hint: "Bookings, table bookings, online orders", tone: "bell", kinds: { ...NONE, booking: true, reservation: true, online: true, housekeeping: true, feedback: true, assigned: true, roomdone: true, job: true, jobdone: true, voice: true, leave: true } },
  { id: "kitchen", label: "Kitchen screen", hint: "Every ticket and online order, loud", tone: "ticket", kinds: { ...NONE, kot: true, online: true, job: true } },
  { id: "till", label: "Till / waiters", hint: "Food ready, table calls, bookings, online orders", tone: "chime", kinds: { ...NONE, ready: true, reservation: true, online: true, call: true, feedback: true, clean: true, assigned: true, job: true, jobdone: true, voice: true, leave: true } },
  { id: "phone", label: "Owner's phone", hint: "Everything, softly", tone: "pop", kinds: { ...ALL } },
  // 0111: a cleaner's phone or the housekeeping tablet — what to clean, and what is given to them
  { id: "cleaning", label: "Cleaning crew", hint: "Tables and rooms to clean, and jobs given to you", tone: "bell", kinds: { ...NONE, housekeeping: true, clean: true, assigned: true, job: true, jobdone: true, voice: true, leave: true } },
];

export function guessStation(propertyType: string, role?: string): StationId {
  if (typeof window === "undefined") return "phone";
  if (role === "housekeeping" || role === "employee") return "cleaning";
  const phone = window.matchMedia("(pointer: coarse)").matches && Math.min(window.innerWidth, window.innerHeight) < 600;
  if (phone) return "phone";
  return propertyType === "restaurant" ? "till" : "front";
}

export function stationPrefs(id: StationId, keep?: Partial<NotifyPrefs>): NotifyPrefs {
  const s = STATIONS.find((x) => x.id === id) ?? STATIONS[3];
  return { on: true, system: false, volume: 80, ...keep, station: s.id, tone: s.tone, kinds: { ...s.kinds } };
}

const KEY = "df-notify";
export function loadPrefs(propertyType: string, role?: string): NotifyPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const p = JSON.parse(raw) as NotifyPrefs; if (p && p.kinds && p.tone) return { ...stationPrefs("phone"), ...p, kinds: { ...NONE, call: p.station !== "kitchen", feedback: p.station !== "kitchen", clean: p.station !== "kitchen" && p.station !== "front", assigned: true, roomdone: p.station === "front" || p.station === "phone", job: true, jobdone: p.station !== "kitchen", taken: true, voice: p.station !== "kitchen", leave: p.station !== "kitchen", ...(p.kinds as Partial<Record<NotifyKind, boolean>>) } }; }
  } catch { /* storage blocked: fall through to the guess */ }
  return stationPrefs(guessStation(propertyType, role));
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
/* Why the alerts were silent (2026-10-23, the owner: "notification sound is not working"). Two things, both on a phone:
   - the unlock listened for pointerdown, and a touch's pointerdown is not a gesture that may start sound (the spec's list
     is keydown, mousedown, a mouse's pointerdown, a touch's pointerup, touchend) — so on a phone or an iPad the context
     never left "suspended". It now listens for pointerup, touchend, click and keydown too (armAudioUnlock);
   - an iPhone's ring/silent switch mutes Web Audio, which plays as "ambient" sound. Asking for a "playback" audio session
     (navigator.audioSession, Safari 16.4+) — and, for older ones, playing a moment of silence through an <audio> element
     inside the tap — makes it play like media, through the switch.
   And iOS leaves a context "interrupted" (a call, the app in the background), not "suspended": anything but "running" is
   resumed. */
let primed = false;
function silentWav(): string {
  const n = 400, b = new DataView(new ArrayBuffer(44 + n * 2)); const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); b.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true); b.setUint32(28, 16000, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, "data"); b.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([b.buffer], { type: "audio/wav" }));
}
function playbackSession() {
  try { const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (s && s.type !== "playback") s.type = "playback"; } catch { /* not this browser */ }
  if (primed) return; primed = true;
  try { const a = new Audio(silentWav()); a.setAttribute("playsinline", ""); void a.play().catch(() => { primed = false; }); } catch { primed = false; }
}
export function unlockAudio() { const c = audio(); if (!c) return; playbackSession(); if (c.state !== "running") void c.resume().catch(() => {}); }
export const audioBlocked = () => { const c = audio(); return !c || c.state !== "running"; };
/** Every gesture that may start sound unlocks it — kept for the whole visit, since iOS can suspend the context again. */
export function armAudioUnlock(): () => void {
  const ev = ["pointerup", "touchend", "click", "keydown"] as const;
  const f = () => unlockAudio();
  const vis = () => { if (document.visibilityState === "visible") { const c = audio(); if (c && c.state !== "running") void c.resume().catch(() => {}); } };
  ev.forEach((e) => window.addEventListener(e, f, { passive: true, capture: true })); document.addEventListener("visibilitychange", vis);
  return () => { ev.forEach((e) => window.removeEventListener(e, f, { capture: true })); document.removeEventListener("visibilitychange", vis); };
}

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
  if (c.state !== "running") void c.resume().catch(() => {});
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
