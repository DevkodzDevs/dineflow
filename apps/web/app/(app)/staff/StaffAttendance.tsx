"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, ClipboardCheck, Download, Fingerprint, Plane, QrCode, Square, Columns2, Columns3, CalendarRange } from "lucide-react";
import { Button, Sheet, cn, useToast } from "@/components/ui";
import { QR } from "@/components/QR";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";
import { csvCell } from "@/lib/csv";
import { markStaff, attendanceMonth, type RegisterMonth } from "./actions";

type Person = { id: string; full_name: string; staff_code: string | null; role: string; is_active: boolean; joined_on?: string | null };
type Att = { profile_id: string; in_at: string | null; out_at: string | null; hours: number | null; method_in: string | null };
export type LeaveToday = { profile_id: string; kind: string; to_date: string };
const HOW: Record<string, { label: string; Icon: typeof QrCode }> = { manual: { label: "Manual", Icon: ClipboardCheck }, qr: { label: "Badge", Icon: QrCode }, biometric: { label: "Fingerprint", Icon: Fingerprint }, selfie: { label: "Selfie", Icon: Camera } };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const KIND: Record<string, string> = { casual: "Casual", sick: "Sick", earned: "Earned", unpaid: "Unpaid", other: "Leave" };

/**
 * Attendance (2026-10-23, the owner): today, and — for the owner, managers and a supervisor the owner gave Staff to — the
 * register, a month at a time.
 *
 * Today: who is in and how they punched; anyone on approved leave today shows On leave (absent) by itself — a decided
 * request is enough, nobody marks it. One, two or three across (three unless this device keeps another — the pin).
 * Owner, manager and supervisor may tick someone present by hand when Manual is on (staff_mark checks the role again);
 * everyone's badge QR is here to print, and scans on the Scan page.
 *
 * Register: a row per person, a column per day of the month — P present, L approved leave, A absent (a past day with no
 * punch and no leave, from the day they joined), today ringed — with the month's P · L · A at the end, the months either
 * side a tap away, and a CSV of what is shown. Read on demand (attendanceMonth); leave rows are what 0135 lets them see.
 */
export function StaffAttendance({ today, staff, att, methods, canMark, canRegister = false, leaveToday = [], property }: { today: string; staff: Person[]; att: Att[]; methods: string[]; canMark: boolean; canRegister?: boolean; leaveToday?: LeaveToday[]; property: string }) {
  const [pending, start] = useTransition(); const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const [badge, setBadge] = useState<Person | null>(null);
  const [tab, setTab] = useState<"today" | "register">("today");
  const cols = useViewPref("attendance-cols", ["1", "2", "3"] as const); const across = cols.chosen ?? "3";
  const people = staff.filter((p) => p.is_active);
  const by = new Map(att.map((a) => [a.profile_id, a]));
  const away = new Map(leaveToday.map((l) => [l.profile_id, l]));
  const inNow = people.filter((p) => by.get(p.id)?.in_at).length;
  const onLeave = people.filter((p) => away.has(p.id) && !by.get(p.id)?.in_at).length;
  const manual = methods.includes("manual") && canMark;
  return (
    <section className="rounded-[26px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4 sm:p-5 mt-5" data-staff-attendance>
      {/* the head (2026-10-23, the owner: "not looking good on a phone"): the title broke as "Attend / ance" beside the tabs.
          Now the title never shrinks below its word; on a phone Today | Register drop to their own full-width row. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 mb-3 min-w-0" data-att-head>
        <span className="h-10 w-10 shrink-0 rounded-[13px] grid place-items-center bg-[color-mix(in_srgb,var(--color-green)_20%,transparent)] text-[var(--color-green)]"><ClipboardCheck size={19} aria-hidden /></span>
        <div className="min-w-[8rem] flex-1"><div role="heading" aria-level={2} className="text-[17px] font-extrabold whitespace-nowrap">Attendance</div>
          <div className="text-[12.5px] text-steel num">{inNow} of {people.length} in today{onLeave ? ` · ${onLeave} on leave` : ""}</div></div>
        {canRegister && <div className="flex rounded-full bg-[var(--color-fill)] p-1 max-sm:w-full max-sm:order-last" role="tablist" aria-label="Attendance view">
          {([["today", "Today", ClipboardCheck], ["register", "Register", CalendarRange]] as const).map(([k, l, I]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-att-tab={k}
              className={cn("!min-h-10 h-10 pointer-coarse:h-11 px-3.5 max-sm:flex-1 justify-center rounded-full inline-flex items-center gap-1.5 text-[13px] font-extrabold transition-colors", tab === k ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_4px_rgb(0_0_0/0.22)]" : "text-steel hover:text-[var(--color-label)]")}><I size={15} aria-hidden />{l}</button>))}
        </div>}
        {tab === "today" && people.length > 1 && <div className="max-sm:hidden"><ViewSwitch label="Cards across" data="attendance-cols" shown={across} onPick={cols.pick} saved={cols.saved} onKeep={(v) => { cols.keep(v); toast(`${v} across is your default here`); }}
          options={[{ v: "1", label: "One across", icon: Square }, { v: "2", label: "Two across", icon: Columns2 }, { v: "3", label: "Three across", icon: Columns3 }]} /></div>}
      </div>
      {err && <p className="text-sm text-chili mb-2">{err}</p>}
      {tab === "today" ? (
        <ul className={cn("grid gap-2", across === "2" && "sm:grid-cols-2", across === "3" && "sm:grid-cols-2 xl:grid-cols-3")} data-att-across={across}>
          {people.map((p) => { const a = by.get(p.id); const lv = !a?.in_at ? away.get(p.id) : undefined; const H = a?.method_in ? HOW[a.method_in] : null; return (
            <li key={p.id} className={cn("flex items-center gap-3 rounded-2xl p-2.5 pr-2 min-w-0", a ? "bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)]" : lv ? "bg-[color-mix(in_srgb,var(--color-violet)_10%,transparent)]" : "bg-[var(--color-fill)]")} data-staff-row data-on-leave={lv ? "" : undefined}>
              <span className={cn("h-10 w-10 shrink-0 rounded-full grid place-items-center font-display", a ? "bg-[var(--color-green)] text-[var(--color-on-tint)]" : lv ? "bg-[color-mix(in_srgb,var(--color-violet)_24%,transparent)] text-[var(--color-violet)]" : "bg-[var(--color-fill-2)] text-[var(--color-label-2)]")}>{a ? <Check size={17} /> : lv ? <Plane size={16} aria-hidden /> : p.full_name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{p.full_name}</div>
                <div className="text-xs text-steel truncate num">{a?.in_at ? <>{hhmm(a.in_at)}{a.out_at ? ` → ${hhmm(a.out_at)} · ${a.hours} h` : ""}{H ? ` · ${H.label}` : ""}</>
                  : lv ? <span className="font-semibold text-[var(--color-violet)]">On leave · {KIND[lv.kind] ?? "Leave"}{lv.to_date !== today ? ` · till ${new Date(lv.to_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</span> : "Not in yet"}</div>
              </div>
              {p.staff_code && <button type="button" onClick={() => setBadge(p)} aria-label={`Badge QR for ${p.full_name}`} className="tap-square h-11 w-11 shrink-0 rounded-xl grid place-items-center text-steel hover:bg-[var(--color-fill-2)]"><QrCode size={16} /></button>}
              {manual && (a
                ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await markStaff(p.id, today, false); if (r.error) setErr(r.error); })}>Undo</Button>
                : <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await markStaff(p.id, today, true); if (r.error) setErr(r.error); })} data-mark>Present</Button>)}
            </li>); })}
        </ul>
      ) : <Register today={today} people={people} />}
      <Sheet open={!!badge} onClose={() => setBadge(null)} title={`Badge · ${badge?.full_name ?? ""}`}>
        {badge && <div className="space-y-3 text-center">
          <div className="grid place-items-center rounded-2xl bg-white p-4"><QR value={`df:staff:${badge.staff_code}`} size={200} /></div>
          <div className="font-semibold">{badge.full_name} · <span className="num">{badge.staff_code}</span></div>
          <p className="text-xs text-steel">{property}. Scan on the Scan page: once to clock in, again to clock out.</p>
          <Button variant="outline" className="w-full" onClick={() => window.print()}>Print</Button>
        </div>}
      </Sheet>
    </section>
  );
}

type Mark = "P" | "L" | "A" | "" | "-";
/** The month register: a sticky name column, a narrow column per day, P / L / A in the floor's colours, and the totals. */
function Register({ today, people }: { today: string; people: Person[] }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<RegisterMonth | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { let on = true; setData(null); setErr(null); attendanceMonth(month).then((r) => { if (!on) return; if ("error" in r) setErr(r.error); else setData(r); }); return () => { on = false; }; }, [month]);
  const [y, m] = month.split("-").map(Number); const n = new Date(y, m, 0).getDate();
  const days = Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const shift = (d: number) => { const t = new Date(y, m - 1 + d, 1); setMonth(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`); };
  const grid = useMemo(() => {
    if (!data) return null;
    const inOn = new Set(data.att.filter((a) => a.in_at).map((a) => `${a.profile_id}|${a.work_date}`));
    return people.map((p) => {
      const marks: Mark[] = days.map((d): Mark => {
        if (inOn.has(`${p.id}|${d}`)) return "P";
        if (data.leave.some((l) => l.profile_id === p.id && l.from_date <= d && l.to_date >= d)) return "L";
        if (d > today) return "";
        if (p.joined_on && d < p.joined_on) return "-";
        return "A";
      });
      return { p, marks, P: marks.filter((x) => x === "P").length, L: marks.filter((x) => x === "L").length, A: marks.filter((x) => x === "A").length };
    });
  }, [data, people, today, month]); // eslint-disable-line react-hooks/exhaustive-deps
  const csv = () => {
    if (!grid) return;
    const rows = [["Name", ...days.map((d) => d.slice(8)), "Present", "Leave", "Absent"], ...grid.map((g) => [g.p.full_name, ...g.marks.map((x) => (x === "-" ? "" : x)), g.P, g.L, g.A])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" })); a.download = `attendance-${month}.csv`; a.click();
  };
  const tone: Record<Mark, string> = { P: "bg-[var(--color-green)] text-[var(--color-on-tint)]", L: "bg-[color-mix(in_srgb,var(--color-violet)_26%,transparent)] text-[var(--color-violet)]", A: "bg-[color-mix(in_srgb,var(--color-red)_16%,transparent)] text-[var(--color-red)]", "": "", "-": "" };
  const label = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div data-att-register={month}>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => shift(-1)} aria-label="The month before" className="h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11 rounded-full grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]"><ChevronLeft size={18} aria-hidden /></button>
        <div className="min-w-[9rem] text-center text-[15px] font-extrabold" aria-live="polite">{label}</div>
        <button type="button" onClick={() => shift(1)} disabled={month >= today.slice(0, 7)} aria-label="The month after" className="h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11 rounded-full grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] disabled:opacity-30"><ChevronRight size={18} aria-hidden /></button>
        <span className="ml-auto hidden sm:flex items-center gap-3 text-[11.5px] font-semibold text-steel">{(["P", "L", "A"] as Mark[]).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={cn("h-4 w-4 rounded-[5px] grid place-items-center text-[9.5px] font-extrabold", tone[k])}>{k}</span>{k === "P" ? "Present" : k === "L" ? "Leave" : "Absent"}</span>)}</span>
        <button type="button" onClick={csv} disabled={!grid} className="h-10 pointer-coarse:h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-bold bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] disabled:opacity-40" data-att-csv><Download size={14} aria-hidden />CSV</button>
      </div>
      {err ? <p className="text-sm text-chili">{err}</p> : !grid ? <div className="shimmer h-48 rounded-2xl" /> : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-separator)] [scrollbar-width:thin]">
          <table className="border-separate border-spacing-0 text-left w-max min-w-full" aria-label={`Attendance register, ${label}`}>
            <thead><tr>
              <th scope="col" className="sticky left-0 z-[1] bg-[var(--color-bg-2)] px-3 h-10 text-[11px] font-bold uppercase tracking-[.08em] text-[var(--color-label-2)] border-b border-r border-[var(--color-separator)] min-w-[10rem]">Name</th>
              {days.map((d) => { const wd = new Date(d + "T00:00:00").getDay(); return <th key={d} scope="col" className={cn("w-7 px-0 h-10 text-center border-b border-[var(--color-separator)]", d === today && "bg-[color-mix(in_srgb,var(--color-tint)_12%,transparent)]")}>
                <span className="block text-[11px] font-extrabold num">{Number(d.slice(8))}</span><span className={cn("block text-[9px] font-bold", wd === 0 ? "text-[var(--color-red)]" : "text-[var(--color-label-3)]")}>{"SMTWTFS"[wd]}</span></th>; })}
              {(["P", "L", "A"] as const).map((k) => <th key={k} scope="col" className="w-10 px-1 h-10 text-center text-[11px] font-extrabold border-b border-l border-[var(--color-separator)]">{k}</th>)}
            </tr></thead>
            <tbody>
              {grid.map((g) => (
                <tr key={g.p.id} data-att-person={g.p.id}>
                  <th scope="row" className="sticky left-0 z-[1] bg-[var(--color-bg-2)] px-3 py-1.5 text-[13px] font-semibold border-b border-r border-[var(--color-separator)] max-w-[12rem] truncate">{g.p.full_name}</th>
                  {g.marks.map((x, i) => <td key={i} className={cn("w-7 p-0.5 text-center border-b border-[var(--color-separator)]", days[i] === today && "bg-[color-mix(in_srgb,var(--color-tint)_8%,transparent)]")} title={`${days[i]}: ${x === "P" ? "present" : x === "L" ? "on leave" : x === "A" ? "absent" : x === "-" ? "before they joined" : "—"}`}>
                    {x === "P" || x === "L" || x === "A" ? <span className={cn("mx-auto h-6 w-6 rounded-[7px] grid place-items-center text-[10.5px] font-extrabold", tone[x])}>{x}</span> : <span className="block h-6 text-[var(--color-label-3)] text-[11px] leading-6">{x === "-" ? "·" : ""}</span>}</td>)}
                  <td className="w-10 text-center num text-[13px] font-extrabold text-[var(--color-green)] border-b border-l border-[var(--color-separator)]">{g.P}</td>
                  <td className="w-10 text-center num text-[13px] font-extrabold text-[var(--color-violet)] border-b border-[var(--color-separator)]">{g.L}</td>
                  <td className="w-10 text-center num text-[13px] font-extrabold text-[var(--color-red)] border-b border-[var(--color-separator)]">{g.A}</td>
                </tr>))}
            </tbody>
          </table>
        </div>)}
    </div>
  );
}
