"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Camera, ClipboardCheck, Fingerprint, Lock, MapPin, QrCode, ChevronRight } from "lucide-react";
import { Button, Card, Switch, cn } from "@/components/ui";
import { saveAttendanceSettings } from "./actions";

const WAYS = [
  { key: "manual", Icon: ClipboardCheck, title: "Manual", hint: "Manager marks it" },
  { key: "qr", Icon: QrCode, title: "QR badge", hint: "Scan in, scan out" },
  { key: "biometric", Icon: Fingerprint, title: "Fingerprint / Face ID", hint: "On their own phone" },
  { key: "selfie", Icon: Camera, title: "Selfie + location", hint: "On-site selfie, saved" },
] as const;
const RADII = [50, 100, 150, 250, 500];

/**
 * Which ways people may be marked present. Only the owner changes this (set_attendance_settings checks
 * it again on the server); everyone else sees the same switches, locked, so they know what is on.
 */
export function AttendanceSettings({ owner, phoneReady = true, initial }: { owner: boolean; phoneReady?: boolean; initial: { methods: string[]; lat: number | null; lng: number | null; radius: number } }) {
  const [methods, setMethods] = useState<string[]>(initial.methods);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null);
  const [radius, setRadius] = useState(initial.radius);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [finding, setFinding] = useState(false);
  const [pending, start] = useTransition();
  const dirty = methods.slice().sort().join() !== initial.methods.slice().sort().join() || radius !== initial.radius || loc?.lat !== (initial.lat ?? undefined) || loc?.lng !== (initial.lng ?? undefined);

  const toggle = (k: string, on: boolean) => { setMsg(null); setMethods((m) => on ? [...new Set([...m, k])] : m.filter((x) => x !== k)); };
  const here = () => {
    setMsg(null); setFinding(true);
    navigator.geolocation?.getCurrentPosition(
      (p) => { setLoc({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); setFinding(false); },
      (e) => { setFinding(false); setMsg({ ok: false, text: e.code === 1 ? "Location is blocked for this site — allow it in the browser and try again" : "Could not find this device's location" }); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };
  const save = () => start(async () => {
    const r = await saveAttendanceSettings(methods, loc?.lat ?? null, loc?.lng ?? null, radius);
    setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: "Saved." });
  });

  return (
    <div className="space-y-6" data-attendance-settings>
      {!owner && <div className="flex items-center gap-2.5 rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13px] text-[var(--color-label-2)]"><Lock size={15} className="shrink-0" /> Owner only</div>}
      <Card>
        <div className="flex items-start gap-3 mb-4">
          <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><Fingerprint size={16} /></span>
          <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">Ways to mark attendance</h3></div>
        </div>
        <div className="divide-y divide-[var(--color-separator)]">
          {WAYS.map(({ key, Icon, title, hint }) => { const on = methods.includes(key); return (
            <div key={key} className="flex items-center gap-3 py-3.5 min-w-0" data-way={key}>
              <span className={cn("h-10 w-10 shrink-0 rounded-xl grid place-items-center", on ? "bg-[color-mix(in_srgb,var(--color-tint)_16%,transparent)] text-[var(--color-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}><Icon size={18} /></span>
              <div className="min-w-0 flex-1"><div className="text-[15px] font-semibold">{title}</div><div className="text-[12.5px] text-[var(--color-label-2)] mt-0.5">{hint}</div></div>
              {owner ? <Switch on={on} onChange={(v) => toggle(key, v)} name={title} /> : <span className={cn("shrink-0 text-[12px] font-semibold rounded-full px-2.5 py-1", on ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)]")}>{on ? "On" : "Off"}</span>}
            </div>); })}
        </div>
      </Card>

      {methods.includes("selfie") && (
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><MapPin size={16} /></span>
            <div className="min-w-0 pt-1"><h3 className="text-base font-semibold">Where the property is</h3><p className="text-xs text-steel mt-0.5">Selfies count only here</p></div>
          </div>
          <div className="rounded-2xl bg-[var(--color-fill)] px-4 py-3 text-[13px] flex items-center gap-3 min-w-0">
            <MapPin size={15} className={cn("shrink-0", loc ? "text-[var(--color-green)]" : "text-[var(--color-orange)]")} />
            <span className="min-w-0 flex-1 truncate num" data-loc>{loc ? `${loc.lat}, ${loc.lng}` : "Not set · selfies off"}</span>
            {loc && <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="shrink-0 text-[12px] font-semibold text-[var(--color-tint)]">Map</a>}
          </div>
          {owner && <Button variant="outline" className="mt-3 w-full sm:w-auto" loading={finding} onClick={here} data-here><MapPin size={16} /> Use this device&apos;s location</Button>}
          <div className="mt-5 text-[13px] font-semibold mb-2">Radius</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Radius">
            {RADII.map((r) => <button key={r} type="button" role="radio" aria-checked={radius === r} disabled={!owner} onClick={() => { setRadius(r); setMsg(null); }}
              className={cn("chip num", radius === r && "on")}>{r} m</button>)}
          </div>
        </Card>
      )}

      {(methods.includes("biometric") || methods.includes("selfie")) && (
        <Link href="/labour" className="flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] p-3.5 hover:bg-[var(--color-fill)] transition-colors">
          <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0 text-steel"><QrCode size={16} /></span>
          <span className="flex-1 min-w-0"><span className="block text-sm font-semibold">Send punch links</span><span className="block text-xs text-steel mt-0.5">Labour → worker → Punch link. Staff: My attendance.</span></span>
          <ChevronRight size={16} className="text-steel shrink-0" />
        </Link>
      )}

      {!phoneReady && (methods.includes("biometric") || methods.includes("selfie")) && <div className="rounded-xl px-4 py-3 text-[13px] bg-[color-mix(in_srgb,var(--color-orange)_14%,transparent)]" data-not-ready>Fingerprint and selfie are off — ask DineFlow support.</div>}
      {msg && <div role="status" className={cn("rounded-xl px-4 py-2.5 text-sm", msg.ok ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]")}>{msg.text}</div>}
      {owner && <Button className="w-full sm:w-auto" loading={pending} disabled={!dirty} onClick={save} data-save>Save attendance settings</Button>}
    </div>
  );
}
