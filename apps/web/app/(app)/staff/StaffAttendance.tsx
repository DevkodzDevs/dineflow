"use client";
import { useState, useTransition } from "react";
import { Camera, Check, ClipboardCheck, Fingerprint, QrCode } from "lucide-react";
import { Button, Sheet, cn } from "@/components/ui";
import { QR } from "@/components/QR";
import { markStaff } from "./actions";

type Person = { id: string; full_name: string; staff_code: string | null; role: string; is_active: boolean };
type Att = { profile_id: string; in_at: string | null; out_at: string | null; hours: number | null; method_in: string | null };
const HOW: Record<string, { label: string; Icon: typeof QrCode }> = { manual: { label: "Manual", Icon: ClipboardCheck }, qr: { label: "Badge", Icon: QrCode }, biometric: { label: "Fingerprint", Icon: Fingerprint }, selfie: { label: "Selfie", Icon: Camera } };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * Who on the staff is in today, and how they punched. Owner, manager and supervisor may tick someone
 * present by hand when Manual is on (staff_mark checks the role again); everyone's badge QR is here
 * to print, and scans on the Scan page.
 */
export function StaffAttendance({ today, staff, att, methods, canMark, property }: { today: string; staff: Person[]; att: Att[]; methods: string[]; canMark: boolean; property: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [badge, setBadge] = useState<Person | null>(null);
  const people = staff.filter((p) => p.is_active);
  const by = new Map(att.map((a) => [a.profile_id, a]));
  const inNow = people.filter((p) => by.get(p.id)?.in_at).length;
  const manual = methods.includes("manual") && canMark;
  return (
    <section className="rounded-[26px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4 sm:p-5 mt-5" data-staff-attendance>
      <div className="flex items-center gap-3 mb-3 min-w-0">
        <span className="h-10 w-10 shrink-0 rounded-[13px] grid place-items-center bg-[color-mix(in_srgb,var(--color-green)_20%,transparent)] text-[var(--color-green)]"><ClipboardCheck size={19} aria-hidden /></span>
        <div className="min-w-0 flex-1"><div role="heading" aria-level={2} className="text-[17px] font-extrabold">Attendance today</div><div className="text-[12.5px] text-steel num">{inNow} of {people.length} in</div></div>
        <div className="hidden sm:block h-2 w-40 rounded-full bg-[var(--color-fill)] overflow-hidden" aria-hidden><div className="h-full rounded-full bg-[var(--color-green)]" style={{ width: `${people.length ? (inNow / people.length) * 100 : 0}%` }} /></div>
      </div>
      {err && <p className="text-sm text-chili mb-2">{err}</p>}
      <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {people.map((p) => { const a = by.get(p.id); const H = a?.method_in ? HOW[a.method_in] : null; return (
          <li key={p.id} className={cn("flex items-center gap-3 rounded-2xl p-2.5 pr-2 min-w-0", a ? "bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)]" : "bg-[var(--color-fill)]")} data-staff-row>
            <span className={cn("h-10 w-10 shrink-0 rounded-full grid place-items-center font-display", a ? "bg-[var(--color-green)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill-2)] text-[var(--color-label-2)]")}>{a ? <Check size={17} /> : p.full_name.slice(0, 1)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{p.full_name}</div>
              <div className="text-xs text-steel truncate num">{a?.in_at ? <>{hhmm(a.in_at)}{a.out_at ? ` → ${hhmm(a.out_at)} · ${a.hours} h` : ""}{H ? ` · ${H.label}` : ""}</> : "Not in yet"}</div>
            </div>
            {p.staff_code && <button type="button" onClick={() => setBadge(p)} aria-label={`Badge QR for ${p.full_name}`} className="tap-square h-11 w-11 shrink-0 rounded-xl grid place-items-center text-steel hover:bg-[var(--color-fill-2)]"><QrCode size={16} /></button>}
            {manual && (a
              ? <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await markStaff(p.id, today, false); if (r.error) setErr(r.error); })}>Undo</Button>
              : <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { setErr(null); const r = await markStaff(p.id, today, true); if (r.error) setErr(r.error); })} data-mark>Present</Button>)}
          </li>); })}
      </ul>
      <Sheet open={!!badge} onClose={() => setBadge(null)} title={`Badge · ${badge?.full_name ?? ""}`}>
        {badge && <div className="space-y-3 text-center">
          <div className="grid place-items-center rounded-2xl bg-white p-4"><QR value={`df:staff:${badge.staff_code}`} size={200} /></div>
          <div className="font-semibold">{badge.full_name} · <span className="num">{badge.staff_code}</span></div>
          <p className="text-xs text-steel">{property}. Scan on the Scan page — first scan punches in, the next punches out.</p>
          <Button variant="outline" className="w-full" onClick={() => window.print()}>Print</Button>
        </div>}
      </Sheet>
    </section>
  );
}
