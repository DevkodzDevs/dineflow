"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { Bell, BellOff, BellRing, Bike, CalendarCheck, BedDouble, ChefHat, UtensilsCrossed, Sparkles, Play, Volume2, Monitor, Smartphone, ConciergeBell, Flame, CheckCheck, Settings2, Clock, HandPlatter, Star, SprayCan, UserCheck, CircleCheck, ListTodo, ClipboardCheck, MessagesSquare } from "lucide-react";
import { DEPARTMENTS } from "@dineflow/shared";
import { getClient } from "@/lib/supabase/lazy";
import { formatINR, todayIST } from "@/lib/format";
import { waDate } from "@/lib/wa";
import { cn, Sheet, Switch, useToast } from "@/components/ui";
import { KINDS, STATIONS, TONES, kindsFor, deptSees, loadPrefs, savePrefs, playTone, unlockAudio, stationPrefs, type NotifyKind, type NotifyPrefs, type StationId, type ToneId } from "@/lib/notify";

type Item = { id: string; kind: NotifyKind; title: string; sub: string; href: string; at: number; read: boolean };
type Ctx = {
  feed: Item[]; unread: number; markAllRead: () => void; prefs: NotifyPrefs | null; setPrefs: (p: NotifyPrefs) => void;
  kinds: NotifyKind[]; propertyType: string; openSettings: () => void;
};
const NotifyCtx = createContext<Ctx | null>(null);
export const useNotify = () => useContext(NotifyCtx);

const KIND_ICON: Record<NotifyKind, typeof Bell> = { online: Bike, reservation: CalendarCheck, booking: BedDouble, kot: ChefHat, ready: UtensilsCrossed, housekeeping: Sparkles, call: HandPlatter, feedback: Star, clean: SprayCan, assigned: UserCheck, roomdone: CircleCheck, job: ListTodo, jobdone: ClipboardCheck, taken: UserCheck, voice: MessagesSquare, leave: CalendarCheck };
const KIND_TONE: Record<NotifyKind, string> = {
  online: "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]",
  reservation: "bg-[var(--color-blue-2)] text-[var(--color-blue)]",
  booking: "bg-[var(--color-blue-2)] text-[var(--color-blue)]",
  kot: "bg-[var(--color-red-2)] text-[var(--color-red)]",
  ready: "bg-[var(--color-green-2)] text-[var(--color-green)]",
  housekeeping: "bg-[var(--color-fill)] text-[var(--color-label-2)]",
  call: "bg-[var(--color-orange-2)] text-[var(--color-orange)]",
  feedback: "bg-[var(--color-violet-2)] text-[var(--color-violet)]",
  clean: "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]",
  assigned: "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]",
  roomdone: "bg-[var(--color-green-2)] text-[var(--color-green)]",
  job: "bg-[var(--color-orange-2)] text-[var(--color-orange)]",
  jobdone: "bg-[var(--color-green-2)] text-[var(--color-green)]",
  taken: "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]",
  voice: "bg-[var(--color-violet-2)] text-[var(--color-violet)]",
  leave: "bg-[var(--color-cyan-2)] text-[var(--color-cyan)]",
};
const hm = (v: unknown) => (v ? new Date(str(v)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "");
const mins = (a: unknown, b: unknown) => (a && b ? Math.max(1, Math.round((new Date(str(b)).getTime() - new Date(str(a)).getTime()) / 60000)) : null);
const PRI: Record<string, string> = { "1": "Urgent · ", "2": "High · ", "4": "Low · " };
const deptName = (k: unknown) => (k ? DEPARTMENTS.find((d) => d.key === k)?.label ?? str(k) : "anyone");
const FEED_KEY = "df-notify-feed";
type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

/** Turn a database row into what the alert says. */
function describe(kind: NotifyKind, r: Row): { title: string; sub: string } {
  switch (kind) {
    case "online": return { title: `New online order${r.display_id ? ` #${str(r.display_id)}` : ""}`, sub: [str(r.customer_name), Number(r.gross) ? formatINR(Number(r.gross), { whole: true }) : ""].filter(Boolean).join(" · ") || "Open to accept it" };
    case "reservation": {
      const day = str(r.on_date); const time = str(r.at_time).slice(0, 5);
      return { title: "New table booking", sub: [str(r.guest_name), r.party_size ? `${str(r.party_size)} people` : "", day && day !== todayIST() ? `${waDate(day)} ${time}` : time].filter(Boolean).join(" · ") };
    }
    case "booking": return { title: `New room booking${r.booking_no ? ` #${str(r.booking_no)}` : ""}`, sub: [`${Number(r.adults ?? 0) + Number(r.children ?? 0) || 1} guests`, r.check_in ? `arrives ${waDate(str(r.check_in))}` : "", str(r.source).replace("_", " ")].filter(Boolean).join(" · ") };
    case "kot": return { title: `New kitchen ticket${r.kot_no ? ` · KOT ${str(r.kot_no)}` : ""}`, sub: "Fired just now" };
    case "ready": return { title: `Food ready${r.kot_no ? ` · KOT ${str(r.kot_no)}` : ""}`, sub: "Ready to serve" };
    case "housekeeping": return { title: r.place ? `Room ${str(r.place)} to clean` : "Room to clean", sub: str(r.kind).replace(/_/g, " ") || "A new housekeeping task" };
    case "clean": return { title: `${str(r.place) || "A table"} to clean`, sub: "Paid and left — take it on Cleaning" };
    case "roomdone": return { title: `Room ${str(r.place)} is clean`, sub: "Finished just now — inspect it, or sell it" };
    case "job": return { title: `${PRI[str(r.priority)] ?? ""}${str(r.title)}`, sub: [str(r.place), `for ${deptName(r.department)}`, r.guest_impact ? "a guest is waiting" : ""].filter(Boolean).join(" · ") };
    case "jobdone": { const m = mins(r.taken_at, r.done_at); return { title: `Done · ${str(r.label ?? r.title)}`, sub: [r.title ? str(r.place) : "", r.who ? `${str(r.who)}${m ? ` · ${m} min` : ""}` : "", str(r.note ?? "")].filter(Boolean).join(" — ") || "Finished just now" }; }
    case "taken": return { title: `${str(r.who ?? "Someone")} took ${str(r.label ?? r.title)}`, sub: `Started ${hm(r.taken_at)}${r.title && r.place ? ` · ${str(r.place)}` : ""}` };
    case "assigned": return { title: `Given to you · ${r.title ? str(r.title) : r.room_id ? `Room ${str(r.place)}` : str(r.place) || "a job"}`, sub: r.title ? [str(r.place), str(r.details)].filter(Boolean).join(" — ") || "A job for you" : str(r.notes).startsWith("Failed inspection") ? str(r.notes) : r.room_id ? "A room to clean" : "A table to clean" };
    case "call": return { title: r.kind === "bill" ? "A table wants the bill" : r.kind === "water" ? "A table wants water" : "A table is calling a waiter", sub: "See which on Orders" };
    case "feedback": return { title: `Low rating · ${str(r.rating)}★`, sub: [str(r.comment).slice(0, 80), (r.tags as string[] | null)?.join(", ")].filter(Boolean).join(" — ") || "Read it under Customers → Feedback" };
    // 0124: `ev` is set where the event is heard — "new" and "reply" reach the owner, "answer" the person who sent it
    case "voice": {
      const what = ({ complaint: "complaint", feedback: "feedback", suggestion: "idea", appreciation: "thanks" } as Record<string, string>)[str(r.kind)] ?? "message";
      const who = r.anonymous ? "Anonymous" : str(r.author_name) || "Staff";
      if (r.ev === "new") return { title: `New ${what} from your staff`, sub: `${str(r.subject)} — ${who}` };
      if (r.ev === "reply") return { title: `${who} answered`, sub: str(r.subject) };
      // the row cannot say whether the owner wrote, read or moved it — so the alert says where it stands now
      const where = ({ seen: "seen by the owner", in_progress: "the owner is on it", resolved: "resolved" } as Record<string, string>)[str(r.status)] ?? "updated";
      return { title: "Update from the owner", sub: `${str(r.subject)} — ${where}` };
    }
    // 0127: `ev` "ask" reaches whoever decides (RLS narrows the rows to them), "answer" the person who asked
    case "leave": {
      const days = Number(r.days ?? 0); const span = `${str(r.from_date)}${r.to_date !== r.from_date ? ` → ${str(r.to_date)}` : ""} · ${days} day${days === 1 ? "" : "s"}`;
      if (r.ev === "ask") return { title: `${str(r.who) || "Someone"} asks for ${str(r.kind)} leave`, sub: span };
      return { title: r.status === "approved" ? "Your leave is approved" : "Your leave was not approved", sub: [span, str(r.decision_note ?? "")].filter(Boolean).join(" — ") };
    }
  }
}

/**
 * Listens for new orders, bookings and tickets on this property (Supabase realtime, the same tables
 * the screens already stream) and announces each one this device has switched on: its tone, a toast,
 * a line in the bell's list, and — while the app is in the background, if allowed — a system
 * notification. Mounted once in the (app) layout, so it hears events on every screen.
 */
export function NotifierProvider({ modules, propertyType, me, role = "", dept = null, children }: { modules: string[]; propertyType: string; me?: string; role?: string; dept?: string | null; children: ReactNode }) {
  const toast = useToast();
  /* Rendered from the start with fixed defaults, replaced by this device's saved choice right after
     mount: the settings panel then has its full height in the server HTML, instead of appearing a
     moment later and pushing every card below it down (Settings measured CLS 0.148). */
  const [prefs, setPrefsState] = useState<NotifyPrefs | null>(() => stationPrefs("phone"));
  const [feed, setFeed] = useState<Item[]>([]);
  const [settings, setSettings] = useState(false);
  /* Keyed by what the list holds, not by the array: every refresh renders the layout again and hands over a new
     `modules` array, which re-made `kinds`, which tore the channel down and joined it again — an event arriving in
     that gap (a burst: a table paid, then the next one) was never announced. */
  const modKey = modules.join(",");
  const kinds = useMemo(() => kindsFor(modKey ? modKey.split(",") : [], role), [modKey, role]);
  const live = useRef({ prefs, toast });
  live.current = { prefs, toast };
  const seen = useRef(new Set<string>());

  useEffect(() => {
    setPrefsState(loadPrefs(propertyType, role));
    try { const f = JSON.parse(sessionStorage.getItem(FEED_KEY) ?? "[]") as Item[]; if (Array.isArray(f)) setFeed(f.slice(0, 40)); } catch { /* none */ }
    const onPrefs = (e: Event) => setPrefsState((e as CustomEvent<NotifyPrefs>).detail);
    window.addEventListener("df-notify-prefs", onPrefs);
    // a browser only lets a page make sound after a touch or a key: the first one unlocks it
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true }); window.addEventListener("keydown", unlock);
    return () => { window.removeEventListener("df-notify-prefs", onPrefs); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, [propertyType, role]);
  useEffect(() => { try { sessionStorage.setItem(FEED_KEY, JSON.stringify(feed.slice(0, 40))); } catch { /* full */ } }, [feed]);

  const setPrefs = useCallback((p: NotifyPrefs) => { setPrefsState(p); savePrefs(p); }, []);

  /** A job someone else took or finished: its alerts leave this person's bell (a supervisor's stay — they hear who). */
  const drop = useCallback((id: string) => { setFeed((f) => f.filter((i) => !i.id.includes(id))); }, []);
  const names = useRef(new Map<string, string>());
  const nameOf = useCallback(async (id: unknown) => {
    const k = str(id); if (!k) return null; if (names.current.has(k)) return names.current.get(k)!;
    try { const c = await getClient(); const { data } = await c.from("profiles").select("full_name").eq("id", k).maybeSingle(); const n = (data as { full_name?: string } | null)?.full_name ?? null; if (n) names.current.set(k, n); return n; } catch { return null; }
  }, []);
  const announce = useCallback((kind: NotifyKind, row: Row) => {
    const p = live.current.prefs; if (!p || !p.kinds[kind]) return;
    const key = `${kind}:${str(row.id)}`; if (seen.current.has(key)) return; seen.current.add(key);
    const { title, sub } = describe(kind, row); const href = KINDS.find((k) => k.kind === kind)!.href;
    setFeed((f) => [{ id: key, kind, title, sub, href, at: Date.now(), read: false }, ...f].slice(0, 40));
    if (p.on) playTone(p.tone, p.volume);
    live.current.toast(sub ? `${title} — ${sub}` : title, "info");
    if (p.system && typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      const opts = { body: sub, tag: key, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: href } };
      void (async () => {
        try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification(title, opts); return; } } catch { /* fall through */ }
        try { new Notification(title, opts); } catch { /* not allowed here */ }
      })();
    }
  }, []);

  useEffect(() => {
    if (!kinds.length) return;
    let sb: SupabaseClient | null = null, ch: RealtimeChannel | null = null, gone = false;
    const t = setTimeout(() => void (async () => {
      const c = await getClient(); if (gone) return;
      sb = c; ch = c.channel("df-notify");
      /* One binding per table and event, however many alerts listen to it: two identical postgres_changes bindings
         on one channel left the server's list and the client's out of step, and the whole channel went quiet —
         a supervisor's "Room 104 is clean" and a cleaner's "T4 to clean" never arrived (0112). */
      const listeners = new Map<string, ((r: Row) => void)[]>();
      const on = (table: string, event: "INSERT" | "UPDATE", fn: (r: Row) => void) => { const k = `${table}|${event}`; listeners.set(k, [...(listeners.get(k) ?? []), fn]); };
      const ins = (table: string, kind: NotifyKind, ok: (r: Row) => boolean = () => true) => {
        if (kinds.includes(kind)) on(table, "INSERT", (r) => { if (ok(r)) announce(kind, r); });
      };
      ins("online_orders", "online");
      ins("reservations", "reservation");
      ins("bookings", "booking", (r) => !r.is_block);
      ins("kots", "kot");
      // room tasks are not filtered by RLS: only Housekeeping (and the owner, managers, a supervisor with no department) hears them (0116)
      ins("housekeeping_tasks", "housekeeping", (r) => r.kind !== "maintenance" && deptSees(role, dept, "room", null) && !(me && r.assigned_to === me && kinds.includes("assigned")));
      ins("service_calls", "call");
      ins("guest_feedback", "feedback", (r) => Number(r.rating) <= 3);
      ins("table_cleanings", "clean");
      // a job given to this person (0111): a table or a room, just now, still waiting — keyed by when, so a second
      // hand-over rings too; a task created already given to them (a failed inspection going back) as well (0112)
      if (kinds.includes("assigned") && me) for (const table of ["table_cleanings", "housekeeping_tasks", "jobs"]) for (const event of ["UPDATE", "INSERT"] as const) on(table, event, (r) => {
        const at = r.assigned_at ? new Date(str(r.assigned_at)).getTime() : 0;
        if (r.assigned_to === me && r.assigned_by !== me && r.status === "pending" && r.source !== "repeat" && Date.now() - at < 60_000) announce("assigned", { ...r, id: `${str(r.id)}:${str(r.assigned_at)}` });
      });
      // a job raised for my department (0113) — a supervisor hears every department's; the raiser and the one it was given to already know
      const boss = ["owner", "manager", "supervisor", "supervisor_2"].includes(role);
      if (kinds.includes("job")) on("jobs", "INSERT", (r) => {
        if (r.created_by === me || r.assigned_to === me || r.source === "repeat") return;
        if (deptSees(role, dept, "job", (r.department as string) ?? null)) announce("job", r);
      });
      /* Taken and finished, in every department (0116): when someone else takes a job or finishes it, the other staff's
         alerts for it go; the department's supervisors (and the owner, managers) hear who took it and from when, then
         who finished it and how long it took. Whoever raised a job hears it is done. */
      const kindOf = (table: string, r: Row): ["table" | "room" | "job", string | null] => table === "jobs" ? ["job", (r.department as string) ?? null] : table === "table_cleanings" ? ["table", null] : r.kind === "maintenance" ? ["job", "engineering"] : ["room", null];
      const labelOf = (table: string, r: Row) => table === "jobs" ? str(r.title) : table === "table_cleanings" ? str(r.place) || "a table" : `${r.kind === "maintenance" ? "Repair · " : ""}Room ${str(r.place)}`;
      for (const table of ["jobs", "table_cleanings", "housekeeping_tasks"]) on(table, "UPDATE", (r) => {
        const [kind, jd] = kindOf(table, r); const mine = deptSees(role, dept, kind, jd);
        const fresh = (v: unknown) => !!v && Date.now() - new Date(str(v)).getTime() < 60_000;
        if (r.status === "in_progress" && r.taken_by !== me && fresh(r.taken_at)) {
          if (!boss) { drop(str(r.id)); return; }
          if (kinds.includes("taken") && mine) void nameOf(r.taken_by).then((who) => announce("taken", { ...r, id: `${str(r.id)}:taken`, who, label: labelOf(table, r) }));
        } else if ((r.status === "done" || r.status === "skipped") && r.done_by !== me && fresh(r.done_at)) {
          if (!boss && r.created_by !== me) { drop(str(r.id)); return; }
          if (r.status !== "done") return;
          if (table === "housekeeping_tasks" && r.kind !== "maintenance") { if (kinds.includes("roomdone") && mine) announce("roomdone", r); return; }
          if (kinds.includes("jobdone") && (r.created_by === me || (boss && mine))) void nameOf(r.done_by).then((who) => announce("jobdone", { ...r, id: `${str(r.id)}:done`, who, label: labelOf(table, r) }));
        }
      });
      /* Feedback & complaints (0124). RLS already narrows the rows: the owner hears every item of the property, anyone
         else only their own. The owner: a new item, and a staff answer on an old one (its staff_at moved past the
         owner's last look). The person who sent it: the owner's answer or move (owner_at moved past their last look). */
      if (kinds.includes("voice")) {
        const fresh = (v: unknown) => !!v && Date.now() - new Date(str(v)).getTime() < 60_000;
        const after = (a: unknown, b: unknown) => !!a && (!b || new Date(str(a)).getTime() > new Date(str(b)).getTime());
        if (role === "owner") {
          on("staff_voice", "INSERT", (r) => announce("voice", { ...r, ev: "new" }));
          on("staff_voice", "UPDATE", (r) => { if (fresh(r.staff_at) && after(r.staff_at, r.created_at) && after(r.staff_at, r.owner_seen_at)) announce("voice", { ...r, id: `${str(r.id)}:${str(r.staff_at)}`, ev: "reply" }); });
        } else {
          on("staff_voice", "UPDATE", (r) => { if (fresh(r.owner_at) && after(r.owner_at, r.author_seen_at)) announce("voice", { ...r, id: `${str(r.id)}:${str(r.owner_at)}`, ev: "answer" }); });
        }
      }
      /* Leave (0127): whoever may decide hears a new request (RLS hands them only the ones they may see, never their own
         read as someone else's); the person who asked hears the decision. */
      if (kinds.includes("leave")) {
        on("staff_leave", "INSERT", (r) => { if (r.profile_id !== me && ["owner", "manager", "supervisor", "supervisor_2"].includes(role ?? "")) void nameOf(r.profile_id).then((who) => announce("leave", { ...r, ev: "ask", who })); });
        on("staff_leave", "UPDATE", (r) => { if (r.profile_id === me && (r.status === "approved" || r.status === "rejected") && !!r.decided_at && Date.now() - new Date(str(r.decided_at)).getTime() < 60_000) announce("leave", { ...r, id: `${str(r.id)}:${str(r.status)}`, ev: "answer" }); });
      }
      if (kinds.includes("ready")) on("kots", "UPDATE", (r) => {
        const at = r.ready_at ? new Date(str(r.ready_at)).getTime() : 0;
        if (r.status === "ready" && Date.now() - at < 60_000) announce("ready", r);
      });
      for (const [k, fns] of listeners) {
        const [table, event] = k.split("|") as [string, "INSERT" | "UPDATE"];
        ch.on("postgres_changes", { event, schema: "public", table }, (e) => { const r = e.new as Row; for (const f of fns) f(r); });
      }
      ch.subscribe();
    })(), 1500); // after the screen paints, like useLive
    return () => { gone = true; clearTimeout(t); if (sb && ch) void sb.removeChannel(ch); };
  }, [kinds, announce, drop, nameOf, me, role, dept]);

  const markAllRead = useCallback(() => setFeed((f) => f.map((i) => ({ ...i, read: true }))), []);
  const value: Ctx = { feed, unread: feed.filter((i) => !i.read).length, markAllRead, prefs, setPrefs, kinds, propertyType, openSettings: () => setSettings(true) };
  return (
    <NotifyCtx.Provider value={value}>
      {children}
      <Sheet open={settings} onClose={() => setSettings(false)} title="Notifications on this device"><NotificationSettings /></Sheet>
    </NotifyCtx.Provider>
  );
}

const ago = (t: number) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`; };

/** The bell in the top bar: a count of what is new, and a panel listing it. */
export function NotificationBell({ lateKots }: { lateKots: number }) {
  const n = useNotify(); const path = usePathname();
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", out); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", out); window.removeEventListener("keydown", esc); };
  }, [open]);
  const unread = n?.unread ?? 0; const badge = unread + lateKots;
  const toggle = () => setOpen((o) => !o);
  // whatever closes the panel — the bell, a tap outside, Escape, a link — what was listed has been seen
  const wasOpen = useRef(false); const markRead = n?.markAllRead;
  useEffect(() => { if (wasOpen.current && !open) markRead?.(); wasOpen.current = open; }, [open, markRead]);
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" aria-label={badge ? `Notifications, ${badge} new` : "Notifications"}
        className={cn("relative h-11 w-11 grid place-items-center rounded-full hover:bg-[var(--color-fill)]", open && "bg-[var(--color-fill)]")}>
        {n?.prefs && !n.prefs.on ? <BellOff size={17} /> : unread ? <BellRing size={17} /> : <Bell size={17} />}
        {badge > 0 && <span className="absolute -top-0.5 -right-0.5 num h-4 min-w-4 px-1 rounded-full bg-chili text-white text-[10px] grid place-items-center" data-bell-count={badge}>{badge > 99 ? "99+" : badge}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" data-no-gesture
          className="notify-panel material-thick fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[76px] sm:top-[calc(100%+10px)] sm:w-[23rem] z-50 rounded-[22px] border border-[var(--color-separator)] shadow-[var(--shadow-pop)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <span className="text-[15px] font-semibold flex-1">Notifications</span>
            {unread > 0 && <button type="button" onClick={() => n?.markAllRead()} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-tint)] !min-h-8 px-2 rounded-full hover:bg-[var(--color-fill)]"><CheckCheck size={14} /> Mark read</button>}
          </div>
          <div className="max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain px-2 pb-2">
            {lateKots > 0 && (
              <Link href="/kitchen" className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-[var(--color-fill)] bg-[var(--color-red-2)]">
                <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-[var(--color-red)] text-white"><Flame size={18} /></span>
                <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold">{lateKots} kitchen ticket{lateKots === 1 ? "" : "s"} running late</span><span className="block text-xs text-[var(--color-label-2)]">Open the kitchen</span></span>
              </Link>
            )}
            {(n?.feed ?? []).map((i) => { const Icon = KIND_ICON[i.kind]; return (
              <Link key={i.id} href={i.href} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 hover:bg-[var(--color-fill)]">
                <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", KIND_TONE[i.kind])}><Icon size={18} /></span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5"><span className="text-[13.5px] font-semibold truncate">{i.title}</span>{!i.read && <span className="h-2 w-2 rounded-full bg-[var(--color-tint)] shrink-0" aria-label="new" />}</span>
                  <span className="block text-xs text-[var(--color-label-2)] truncate">{i.sub}</span>
                </span>
                <span className="text-[11px] text-steel shrink-0 inline-flex items-center gap-1"><Clock size={11} />{ago(i.at)}</span>
              </Link>
            ); })}
            {!lateKots && !(n?.feed.length) && (
              <div className="text-center px-6 py-8">
                <span className="mx-auto h-12 w-12 rounded-2xl grid place-items-center bg-[var(--color-fill)] text-steel"><Bell size={20} /></span>
                <div className="text-sm font-semibold mt-3">You are all caught up</div>
                <p className="text-xs text-[var(--color-label-2)] mt-1">New orders, bookings and kitchen tickets appear here — with a sound — the moment they arrive.</p>
              </div>
            )}
          </div>
          <button type="button" onClick={() => { setOpen(false); n?.openSettings(); }} className="w-full !rounded-none flex items-center gap-2.5 px-4 !min-h-[52px] border-t border-[var(--color-separator)] text-[13.5px] font-semibold hover:bg-[var(--color-fill)]">
            <Settings2 size={16} className="text-steel" /> <span className="flex-1 text-left">Sound &amp; alerts</span>
            <span className="text-xs text-steel font-normal truncate max-w-[45%]">{n?.prefs ? (n.prefs.on ? `${TONES.find((t) => t.id === n.prefs!.tone)?.label} · ${STATIONS.find((s) => s.id === n.prefs!.station)?.label ?? "Custom"}` : "Sound off") : ""}</span>
          </button>
        </div>
      )}
    </div>
  );
}

const STATION_ICON: Record<StationId, typeof Bell> = { front: ConciergeBell, kitchen: ChefHat, till: Monitor, phone: Smartphone, cleaning: SprayCan, custom: Settings2 };

/** Per-device settings: which machine this is, the tone, volume, which alerts, and system notifications. */
export function NotificationSettings() {
  const n = useNotify();
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => { setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission); }, []);
  if (!n?.prefs) return null;
  const p = n.prefs; const set = (q: Partial<NotifyPrefs>) => n.setPrefs({ ...p, ...q });
  const kinds = KINDS.filter((k) => n.kinds.includes(k.kind));
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  const ask = async () => {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission(); setPerm(r);
    if (r === "granted") set({ system: true });
  };
  return (
    <div className="space-y-6">
      {/* master sound switch */}
      <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] p-3.5 cursor-pointer">
        <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", p.on ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-steel")}>{p.on ? <Volume2 size={18} /> : <BellOff size={18} />}</span>
        <span className="flex-1 min-w-0"><span className="block text-sm font-semibold">Play a sound</span><span className="block text-xs text-steel">On this device, while DineFlow is open</span></span>
        <Switch on={p.on} onChange={(v) => set({ on: v })} name="Play a sound" />
      </label>

      {/* the machine */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-steel mb-2">This device is</div>
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
          {STATIONS.map((s) => { const Icon = STATION_ICON[s.id]; const on = p.station === s.id; return (
            <button key={s.id} type="button" aria-pressed={on} onClick={() => { const q = stationPrefs(s.id, { on: p.on, volume: p.volume, system: p.system }); n.setPrefs(q); if (q.on) playTone(q.tone, q.volume); }}
              className={cn("min-w-0 text-left rounded-2xl border p-3 flex flex-col items-start gap-2 transition-colors !min-h-[96px]", on ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_10%,transparent)]" : "border-[var(--color-separator)] hover:border-[var(--color-label-3)]")}>
              <span className={cn("h-8 w-8 rounded-lg grid place-items-center", on ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-steel")}><Icon size={16} /></span>
              <span className="min-w-0"><span className="block text-[13px] font-semibold">{s.label}</span><span className="block text-[11px] text-steel leading-snug">{s.hint}</span></span>
            </button>
          ); })}
        </div>
        {p.station === "custom" && <p className="text-xs text-steel mt-2">Custom — your own mix of tone and alerts. Pick a device above to start again from its defaults.</p>}
      </div>

      {/* tone */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-steel mb-2">Tone</div>
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
          {TONES.map((t) => { const on = p.tone === t.id; return (
            <button key={t.id} type="button" aria-pressed={on} onClick={() => { set({ tone: t.id as ToneId, station: "custom" }); playTone(t.id, p.volume); }}
              className={cn("min-w-0 text-left rounded-2xl border px-3 py-2.5 flex items-center gap-2.5 transition-colors !min-h-[56px]", on ? "border-[var(--color-tint)] bg-[color-mix(in_srgb,var(--color-tint)_10%,transparent)]" : "border-[var(--color-separator)] hover:border-[var(--color-label-3)]")}>
              <span className={cn("h-8 w-8 rounded-full grid place-items-center shrink-0", on ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-steel")}><Play size={13} className="ml-0.5" /></span>
              <span className="min-w-0"><span className="block text-[13px] font-semibold">{t.label}</span><span className="block text-[11px] text-steel leading-snug truncate">{t.hint}</span></span>
            </button>
          ); })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Volume2 size={16} className="text-steel shrink-0" />
          <input type="range" min={0} max={100} step={5} value={p.volume} aria-label="Volume" className="flex-1 accent-[var(--color-tint)]"
            onChange={(e) => set({ volume: Number(e.target.value) })} onPointerUp={() => playTone(p.tone, p.volume)} onKeyUp={() => playTone(p.tone, p.volume)} />
          <span className="num text-xs text-steel w-9 text-right">{p.volume}%</span>
        </div>
      </div>

      {/* which alerts */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-steel mb-2">Alert me about</div>
        <div className="rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden">
          {kinds.map((k) => { const Icon = KIND_ICON[k.kind]; return (
            <label key={k.kind} className="flex items-center gap-3 px-3.5 py-3 cursor-pointer min-h-[60px]">
              <span className={cn("h-9 w-9 rounded-xl grid place-items-center shrink-0", KIND_TONE[k.kind])}><Icon size={16} /></span>
              <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-semibold">{k.label}</span><span className="block text-[11.5px] text-steel">{k.hint}</span></span>
              <Switch on={p.kinds[k.kind]} onChange={(v) => set({ kinds: { ...p.kinds, [k.kind]: v }, station: "custom" })} name={k.label} />
            </label>
          ); })}
          {kinds.length === 0 && <p className="px-3.5 py-3 text-sm text-steel">None of the sections that send alerts are switched on for you.</p>}
        </div>
      </div>

      {/* system notifications */}
      <div className="rounded-2xl border border-[var(--color-separator)] p-3.5 flex flex-wrap items-center gap-3">
        <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 bg-[var(--color-fill)] text-steel"><BellRing size={18} /></span>
        <span className="flex-1 min-w-[12rem]">
          <span className="block text-sm font-semibold">Show when DineFlow is in the background</span>
          <span className="block text-xs text-steel">
            {perm === "unsupported" ? (ios ? "On iPhone, add DineFlow to the Home Screen first, then switch this on there." : "This browser cannot show system notifications.")
              : perm === "denied" ? "Blocked for this site — allow notifications in the browser's site settings."
                : "A system notification with the device's own sound, while another app or tab is in front."}
          </span>
        </span>
        {perm === "granted" ? <Switch on={p.system} onChange={(v) => set({ system: v })} name="System notifications" />
          : perm === "default" ? <button type="button" onClick={() => void ask()} className="btn btn-filled !h-10 px-4 text-sm">Allow</button> : null}
      </div>

      <button type="button" onClick={() => { unlockAudio(); playTone(p.tone, p.volume); }} className="btn btn-gray w-full !h-12 inline-flex items-center justify-center gap-2"><Play size={15} /> Play a test alert</button>
      <p className="text-xs text-steel -mt-3">Each device keeps its own choice: set the kitchen screen to Ticket beep and the front desk to Desk bell. A browser plays sound only after the screen has been touched once since it opened.</p>
    </div>
  );
}
