"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CalendarDays, Hash, Mail, MailCheck, Phone, ShieldCheck, Siren, Users, Pencil, Settings, Languages } from "lucide-react";
import { Sheet, cn } from "@/components/ui";
import { myCard, type MyCard } from "@/app/(app)/me/actions";
import { DeptIcon, deptHue } from "@/app/(app)/staff/StaffPositions";
import { hueOf } from "@/app/(app)/me/MeClient";

/**
 * The profile card (2026-10-23, the owner: "a click on the profile first shows the name, the position, when they started
 * here, and their other details"). The avatar in the top bar — and on a phone the one in the bar — opens this before any
 * page: the person in their colour, their position and team, then the facts: access, staff code, joined (and how long
 * ago), who they report to, phone, email, the emergency contact, languages and a line about them. Edit my profile goes to
 * /me; the owner also gets Settings. Read when it opens (myCard), so no screen carries it.
 */
export function ProfileCard({ open, onClose, accountHref }: { open: boolean; onClose: () => void; accountHref?: string | null }) {
  const [c, setC] = useState<MyCard | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (!open) return; let on = true; myCard().then((r) => { if (!on) return; if (r.card) { setC(r.card); setErr(null); } else setErr(r.error ?? "Could not load your profile."); }); return () => { on = false; }; }, [open]);
  const hue = c ? hueOf(c.avatar_tone, c.dept) : "var(--color-label-3)";
  const tenure = (iso: string | null) => {
    if (!iso) return null; const a = new Date(iso + "T00:00:00"), b = new Date();
    const m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
    // whole phrases, so Tamil and Hindi translate each one (never English plurals built from pieces)
    const y = Math.floor(m / 12), r = m % 12;
    return m <= 0 ? "new this month" : m === 1 ? "1 month here" : m < 12 ? `${m} months here` : r ? `${y} yr ${r} mth here` : `${y} yr here`;
  };
  const fact = (key: string, icon: React.ReactNode, caption: string, value: React.ReactNode, wide = false) => (
    <div key={key} className={cn("flex items-center gap-2.5 min-w-0", wide && "col-span-2")} data-card-fact={key}>
      <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-label-2)]">{icon}</span>
      <span className="min-w-0"><span className="block text-[10.5px] font-bold uppercase tracking-[.08em] text-steel">{caption}</span><span className="block text-[13.5px] font-semibold truncate">{value}</span></span>
    </div>);
  return (
    <Sheet open={open} onClose={onClose} title="Your profile">
      <div className="space-y-4" data-profile-card>
        {!c ? (err ? <p className="text-[14px] text-steel">{err}</p> : <div className="space-y-3"><div className="shimmer h-24 rounded-[20px]" /><div className="shimmer h-40 rounded-[20px]" /></div>) : <>
          <div className="rounded-[22px] overflow-hidden border border-[var(--color-separator)]">
            <div className="h-16" style={{ background: `color-mix(in srgb, ${hue} 22%, var(--color-bg-2))` }} aria-hidden />
            <div className="px-4 pb-4 -mt-9">
              <div className="flex items-end gap-3.5 min-w-0">
                <span className="h-[72px] w-[72px] shrink-0 rounded-full grid place-items-center font-display text-[28px] ring-4 ring-[var(--color-bg-2)]" style={{ background: `color-mix(in srgb, ${hue} 26%, var(--color-bg-2))`, color: `color-mix(in srgb, ${hue} 82%, var(--color-label))` }} aria-hidden>
                  {c.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}</span>
                <div className="min-w-0 pb-1"><div className="text-[21px] font-extrabold leading-tight truncate" data-card-name>{c.name}</div>
                  {c.name !== c.listed && <div className="text-[12px] text-steel truncate">On the staff list as {c.listed}</div>}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 min-w-0">
                {c.title && <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--color-fill)] text-[13px] font-bold max-w-full" data-card-title><BadgeCheck size={14} className="shrink-0" aria-hidden /><span className="truncate">{c.title}</span></span>}
                {c.deptLabel && <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-bold max-w-full" style={{ background: `color-mix(in srgb, ${deptHue(c.dept)} 16%, transparent)`, color: `color-mix(in srgb, ${deptHue(c.dept)} 78%, var(--color-label))` }}><DeptIcon dept={c.dept} size={14} className="shrink-0" /><span className="truncate">{c.deptLabel}</span></span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-3.5 rounded-[20px] bg-[var(--color-fill)] border border-[var(--color-separator)] p-3.5">
            {fact("joined", <CalendarDays size={14} />, "Joined", c.joined_on ? <>{new Date(c.joined_on + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} <span className="text-steel font-medium">· {tenure(c.joined_on)}</span></> : "—", true)}
            {fact("access", <ShieldCheck size={14} />, "Access", c.access)}
            {fact("code", <Hash size={14} />, "Staff code", <span className="num">{c.staff_code ?? "—"}</span>)}
            {fact("boss", <Users size={14} />, "Reports to", c.reports_to ?? "—", true)}
            {fact("phone", <Phone size={14} />, "Phone", <span className="num">{c.phone ?? "—"}</span>)}
            {fact("email", c.verified ? <MailCheck size={14} /> : <Mail size={14} />, c.verified ? "Email · verified" : "Email", c.email ?? "—")}
            {fact("emergency", <Siren size={14} />, "Emergency contact", c.emergency ?? "Not added yet", true)}
            {c.languages.length > 0 && fact("langs", <Languages size={14} />, "Speaks", c.languages.join(" · "), true)}
          </div>
          {c.about && <p className="text-[14px] text-[var(--color-label-2)] leading-snug px-1" data-card-about>“{c.about}”</p>}
        </>}
        <div className={cn("grid gap-2", accountHref === "/settings" ? "grid-cols-2" : "grid-cols-1")}>
          <Link href="/me" onClick={onClose} className="svc-btn go sm" data-card-edit><Pencil size={16} aria-hidden /> Edit my profile</Link>
          {accountHref === "/settings" && <Link href="/settings" onClick={onClose} className="svc-btn quiet sm" data-card-settings><Settings size={16} aria-hidden /> Settings</Link>}
        </div>
      </div>
    </Sheet>
  );
}
