"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { BadgeCheck, BellRing, CalendarCheck, CalendarDays, Check, ChevronRight, Clock3, Copy, Hash, KeyRound, Lock, ListChecks, ListTodo, Mail, MailCheck, MonitorSmartphone, Palette, ShieldCheck, Undo2, UserRound, Users } from "lucide-react";
import { Button, Card, Sheet, cn, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { ThemePicker } from "@/components/ui/Theme";
import { LangPicker } from "@/components/ui/Say";
import { NotificationSettings } from "@/components/shell/Notifier";
import { DeptIcon, deptHue } from "../staff/StaffPositions";
import { saveMyProfile, sendMyCode, verifyMyCode, signOutOthers, type MyDetails } from "./actions";
import { SidebarPicker } from "@/components/shell/SidebarPicker";

export type Me = {
  full_name: string; login: string; role: string; roleKey: string; title: string | null; dept: string | null; deptLabel: string | null;
  staff_code: string | null; joined_on: string | null; reports_to: { name: string; title: string } | null; verified: boolean;
  /** false until 0125 is applied: only phone and contact email can be kept then */
  ready: boolean;
  details: MyDetails;
};
export type Day = { attendance: { in_at: string | null; out_at: string | null } | null; lists: number; listsDone: number; jobs: number };

/** The colours a person can give their circle (0125's check lists the same eight). Tokens, so every theme has them. */
const TONES: { key: string; label: string; hue: string }[] = [
  { key: "green", label: "Green", hue: "var(--color-green)" }, { key: "blue", label: "Blue", hue: "var(--color-blue)" },
  { key: "violet", label: "Violet", hue: "var(--color-violet)" }, { key: "cyan", label: "Teal", hue: "var(--color-cyan)" },
  { key: "orange", label: "Amber", hue: "var(--color-orange)" }, { key: "gold", label: "Gold", hue: "color-mix(in srgb, var(--color-orange) 70%, var(--color-label))" },
  { key: "red", label: "Ruby", hue: "var(--color-red)" }, { key: "slate", label: "Slate", hue: "var(--color-label-2)" },
];
/** What a person can serve a guest in — each in its own script, with the English name under it. */
const LANGS: { key: string; own: string; en: string }[] = [
  { key: "en", own: "English", en: "English" }, { key: "ta", own: "தமிழ்", en: "Tamil" }, { key: "hi", own: "हिन्दी", en: "Hindi" },
  { key: "ml", own: "മലയാളം", en: "Malayalam" }, { key: "te", own: "తెలుగు", en: "Telugu" }, { key: "kn", own: "ಕನ್ನಡ", en: "Kannada" },
  { key: "ur", own: "اردو", en: "Urdu" }, { key: "bn", own: "বাংলা", en: "Bengali" }, { key: "mr", own: "मराठी", en: "Marathi" },
  { key: "gu", own: "ગુજરાતી", en: "Gujarati" }, { key: "or", own: "ଓଡ଼ିଆ", en: "Odia" }, { key: "pa", own: "ਪੰਜਾਬੀ", en: "Punjabi" },
];
export const hueOf = (tone: string | null, dept: string | null) => TONES.find((t) => t.key === tone)?.hue ?? deptHue(dept);
const initials = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const same = (a: MyDetails, b: MyDetails) => JSON.stringify({ ...a, languages: [...a.languages].sort() }) === JSON.stringify({ ...b, languages: [...b.languages].sort() });

/** A card's heading: an icon square, a title, one line under it. */
function Head({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="h-10 w-10 shrink-0 rounded-xl bg-[var(--color-fill)] grid place-items-center text-[var(--color-label-2)]">{icon}</span>
      <div className="min-w-0 pt-0.5"><h2 className="text-[17px] font-bold leading-tight">{title}</h2>{sub && <p className="text-[12.5px] text-steel mt-0.5">{sub}</p>}</div>
    </div>
  );
}

/**
 * My profile: who I am here (read-only — the owner sets it), the details I keep, my sign-in, today at a glance, and
 * this device. Two columns from xl (the profile and my details · today and sign-in), one below; the device's look,
 * language and alerts full width under them — the same components Settings → Appearance and Notifications use.
 */
export function MeClient({ me, day, assist = false }: { me: Me | null; day: Day | null; assist?: boolean }) {
  return (
    <div className="space-y-5" data-me>
      {me && day ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
          <div className="space-y-5 min-w-0"><Profile me={me} /></div>
          <div className="space-y-5 min-w-0"><Today day={day} /><Security me={me} /></div>
        </div>
      ) : (
        <Card className="!p-5" data-me-acting>
          <Head icon={<ShieldCheck size={18} />} title="You are in Master control" sub="No profile here. Device settings below." />
        </Card>
      )}
      <Card data-me-prefs>
        <Head icon={<Palette size={18} />} title="This device" sub="Look and language" />
        <ThemePicker />
        <div className="mt-6 mb-2 text-[13px] font-semibold text-[var(--color-label-2)]">Language</div>
        <LangPicker />
        <SidebarPicker />
        {assist && <AssistSwitch />}
      </Card>
      <Card data-me-alerts>
        <Head icon={<BellRing size={18} />} title="Alerts on this device" sub="Tone and what rings" />
        <NotificationSettings />
      </Card>
    </div>
  );
}

/** Who I am (the owner's record) over the details I keep (mine). */
function Profile({ me }: { me: Me }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [saved, setSaved] = useState<MyDetails>(me.details);
  const [d, setD] = useState<MyDetails>(me.details);
  const [verified, setVerified] = useState(me.verified);
  const [err, setErr] = useState<string | null>(null);
  const dirty = !same(d, saved);
  const set = <K extends keyof MyDetails>(k: K, v: MyDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const hue = hueOf(d.avatar_tone, me.dept);
  const shown = d.display_name.trim() || me.full_name;
  const save = () => start(async () => {
    setErr(null);
    const r = await saveMyProfile(d);
    if ("error" in r) { setErr(r.error ?? "Could not save."); return; }
    const { contact_verified, email_changed, ...next } = r.saved;
    setSaved(next); setD(next); setVerified(contact_verified);
    toast(email_changed && next.contact_email ? "Saved — verify your new email below" : "Saved");
  });
  /* `hue` colours a fact's icon on iPad and up only (2026-10-24); a phone draws them as before */
  const facts: { icon: React.ReactNode; caption: string; value: string; key: string; hue: string }[] = [
    { key: "role", icon: <ShieldCheck size={14} />, caption: "Access", value: me.role, hue: "var(--color-green)" },
    { key: "code", icon: <Hash size={14} />, caption: "Staff code", value: me.staff_code ?? "—", hue: "var(--color-blue)" },
    { key: "joined", icon: <CalendarDays size={14} />, caption: "Joined", value: me.joined_on ? new Date(me.joined_on + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—", hue: "var(--color-orange)" },
    { key: "boss", icon: <Users size={14} />, caption: "Reports to", value: me.reports_to ? `${me.reports_to.name} · ${me.reports_to.title}` : "—", hue: "var(--color-violet)" },
  ];
  return (
    <Card className="!p-0 overflow-hidden" data-me-profile>
      {/* who I am: a band in my colour, my circle over its edge, my name, my position and team, then the owner's facts */}
      {/* iPad and up (2026-10-24, the owner: "design"): a taller band in my colour with a soft gradient and dot texture, a bigger
          circle with a halo, a bigger name; the facts as four tiles, each icon in its own colour. Phones: as they were. */}
      <div className="relative h-20 sm:h-24 md:h-36 overflow-hidden" style={{ background: `color-mix(in srgb, ${hue} 20%, var(--color-bg-2))` }} aria-hidden data-me-band>
        {/* the app's own accents under my colour, so a person with no tone (grey) still gets a living band */}
        <span className="hidden md:block absolute inset-0" style={{ background: `linear-gradient(115deg, color-mix(in srgb, var(--color-tint) 26%, var(--color-bg-2)) 0%, color-mix(in srgb, var(--color-blue) 15%, var(--color-bg-2)) 55%, color-mix(in srgb, var(--color-violet) 14%, var(--color-bg-2)) 100%)` }} />
        <span className="hidden md:block absolute inset-0" style={{ background: `linear-gradient(115deg, color-mix(in srgb, ${hue} 34%, transparent) 0%, transparent 70%)` }} />
        <span className="hidden md:block absolute inset-0 opacity-[.16]" style={{ backgroundImage: `radial-gradient(color-mix(in srgb, var(--color-label) 40%, transparent) 1px, transparent 1.3px)`, backgroundSize: "24px 24px", maskImage: "linear-gradient(90deg, transparent 20%, #000 75%)", WebkitMaskImage: "linear-gradient(90deg, transparent 20%, #000 75%)" }} />
        <span className="hidden md:block absolute -right-12 -top-20 h-64 w-64 rounded-full" style={{ background: `color-mix(in srgb, var(--color-tint) 16%, transparent)` }} />
        <span className="hidden md:block absolute right-40 -bottom-24 h-48 w-48 rounded-full" style={{ background: `color-mix(in srgb, var(--color-blue) 12%, transparent)` }} />
      </div>
      <div className="px-5 pb-5 -mt-10 sm:-mt-12 md:px-7 md:pb-6 md:-mt-14 relative">
        <div className="flex items-end gap-4 min-w-0">
          <span className="h-20 w-20 sm:h-24 sm:w-24 md:h-28 md:w-28 shrink-0 rounded-full grid place-items-center font-display text-[30px] sm:text-[36px] md:text-[42px] ring-4 md:ring-[6px] ring-[var(--color-bg-2)] md:shadow-[0_14px_30px_-16px_rgb(0_0_0/.45)]"
            style={{ background: `color-mix(in srgb, ${hue} 26%, var(--color-bg-2))`, color: `color-mix(in srgb, ${hue} 82%, var(--color-label))` }} data-me-avatar>{initials(shown)}</span>
          <div className="min-w-0 pb-1">
            <div className="text-[22px] sm:text-[26px] md:text-[30px] font-extrabold leading-tight truncate" data-me-name>{shown}</div>
            {d.display_name.trim() && d.display_name.trim() !== me.full_name && <div className="text-[12.5px] text-steel truncate">On the staff list as {me.full_name}</div>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 min-w-0">
          {me.title && <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--color-fill)] text-[13px] font-bold max-w-full"><BadgeCheck size={14} className="shrink-0" aria-hidden /><span className="truncate">{me.title}</span></span>}
          {me.deptLabel && <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-bold max-w-full" style={{ background: `color-mix(in srgb, ${deptHue(me.dept)} 16%, transparent)`, color: `color-mix(in srgb, ${deptHue(me.dept)} 78%, var(--color-label))` }}><DeptIcon dept={me.dept} size={14} className="shrink-0" /><span className="truncate">{me.deptLabel}</span></span>}
        </div>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-2xl bg-[var(--color-fill)] border border-[var(--color-separator)] p-3.5 md:mt-5 md:grid-cols-[repeat(4,minmax(0,1fr))] md:gap-3 md:p-0 md:bg-transparent md:border-0" data-me-facts>
          {facts.map((f) => (
            <div key={f.key} style={{ ["--fh" as string]: f.hue }} className="flex items-center gap-2.5 min-w-0 md:gap-3 md:rounded-[18px] md:border md:border-[var(--color-separator)] md:bg-[var(--color-bg)] md:p-3.5 md:min-h-[76px]" data-me-fact={f.key}>
              <span className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-label-2)] md:h-11 md:w-11 md:rounded-[13px] md:bg-[color-mix(in_srgb,var(--fh)_14%,transparent)] md:text-[var(--fh)] md:[&>svg]:h-[19px] md:[&>svg]:w-[19px]">{f.icon}</span>
              <span className="min-w-0"><span className="block text-[10.5px] font-bold uppercase tracking-[.08em] text-steel md:text-[11px]">{f.caption}</span>
                <span className="block text-[13.5px] font-semibold truncate md:text-[15px] md:font-bold">{f.value}</span></span>
            </div>))}
        </div>
        <p className="mt-2 text-[12px] text-steel">Set by the owner</p>
      </div>

      {/* what I keep: my details, saved together */}
      <div className="border-t border-[var(--color-separator)] p-5" data-me-form>
        <Head icon={<UserRound size={18} />} title="Your details" sub="Only you can edit" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Name you go by</span>
            <input className="mt-1" value={d.display_name} onChange={(e) => set("display_name", e.target.value)} maxLength={40} placeholder={me.full_name} disabled={!me.ready} data-me-field="display_name" />
            <span className="mt-1 block text-[11.5px] text-steel">On the staff list you stay {me.full_name}.</span></label>
          <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Phone</span>
            <input className="mt-1" type="tel" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} placeholder="98400 12345" data-me-field="phone" /></label>
          <div className="sm:col-span-2 min-w-0">
            <label className="block"><span className="text-[13px] font-semibold text-steel">Email</span>
              <input className="mt-1" type="email" inputMode="email" autoComplete="email" value={d.contact_email} onChange={(e) => set("contact_email", e.target.value)} maxLength={120} placeholder="you@example.com" data-me-field="contact_email" /></label>
            <EmailState email={saved.contact_email} verified={verified} editing={d.contact_email.trim().toLowerCase() !== saved.contact_email.trim().toLowerCase()} onVerified={() => setVerified(true)} />
          </div>
          <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Emergency contact</span>
            <input className="mt-1" value={d.emergency_name} onChange={(e) => set("emergency_name", e.target.value)} maxLength={60} placeholder="Name · how they are related" disabled={!me.ready} data-me-field="emergency_name" /></label>
          <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Their number</span>
            <input className="mt-1" type="tel" inputMode="tel" value={d.emergency_phone} onChange={(e) => set("emergency_phone", e.target.value)} maxLength={20} placeholder="98400 67890" disabled={!me.ready} data-me-field="emergency_phone" /></label>
          <div className="sm:col-span-2 min-w-0" data-me-langs>
            <div className="text-[13px] font-semibold text-steel mb-1.5">Languages you speak <span className="font-normal">— to a guest</span></div>
            <div className="flex flex-wrap gap-2" translate="no">
              {LANGS.map((l) => { const on = d.languages.includes(l.key); return (
                <button key={l.key} type="button" aria-pressed={on} disabled={!me.ready} onClick={() => set("languages", on ? d.languages.filter((x) => x !== l.key) : [...d.languages, l.key])} data-lang-key={l.key}
                  className={cn("!min-h-11 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13.5px] font-bold transition-colors", on ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
                  {on && <Check size={14} strokeWidth={3} aria-hidden />}{l.own}{l.own !== l.en && <span className={cn("text-[11.5px] font-semibold", on ? "opacity-70" : "text-steel")}>{l.en}</span>}
                </button>); })}
            </div>
          </div>
          <label className="block sm:col-span-2 min-w-0"><span className="text-[13px] font-semibold text-steel">About you <span className="font-normal num">({d.about.length}/200)</span></span>
            <textarea className="mt-1" rows={2} value={d.about} onChange={(e) => set("about", e.target.value.slice(0, 200))} placeholder="Ten years on the floor · loves the breakfast shift" disabled={!me.ready} data-me-field="about" /></label>
          <div className="sm:col-span-2 min-w-0" data-me-tones>
            <div className="text-[13px] font-semibold text-steel mb-1.5">Colour of your circle</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={!d.avatar_tone} disabled={!me.ready} onClick={() => set("avatar_tone", null)} title="Your team's colour" aria-label="Your team's colour" data-me-tone="team"
                className={cn("h-11 px-3 rounded-full inline-flex items-center gap-2 text-[12.5px] font-bold", !d.avatar_tone ? "ring-2 ring-[var(--color-label)]" : "bg-[var(--color-fill)]")}>
                <span className="h-5 w-5 rounded-full" style={{ background: deptHue(me.dept) }} aria-hidden />Team</button>
              {TONES.map((t) => (
                <button key={t.key} type="button" aria-pressed={d.avatar_tone === t.key} disabled={!me.ready} onClick={() => set("avatar_tone", t.key)} title={t.label} aria-label={t.label} data-me-tone={t.key}
                  className={cn("h-11 w-11 rounded-full grid place-items-center", d.avatar_tone === t.key && "ring-2 ring-[var(--color-label)]")}>
                  <span className="h-7 w-7 rounded-full grid place-items-center text-[var(--color-bg-2)]" style={{ background: t.hue }}>{d.avatar_tone === t.key && <Check size={15} strokeWidth={3.5} aria-hidden />}</span>
                </button>))}
            </div>
          </div>
        </div>
        {!me.ready && <p className="mt-3 text-[12.5px] text-steel">Phone and email save now. More soon.</p>}
        {err && <p className="mt-3 text-[14px] font-semibold text-chili" role="alert" data-me-error>{err}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
          {dirty && <button type="button" onClick={() => { setD(saved); setErr(null); }} className="svc-btn quiet sm !px-4" data-me-undo><Undo2 size={16} aria-hidden /> Undo</button>}
          <button type="button" disabled={!dirty || pending} onClick={save} className="svc-btn go sm !px-5 max-sm:flex-1" data-me-save><Check size={17} aria-hidden />{pending ? "Saving…" : dirty ? "Save my details" : "Saved"}</button>
        </div>
      </div>
    </Card>
  );
}

/** Under the email: proved, or not yet — then a code to send and type back. */
function EmailState({ email, verified, editing, onVerified }: { email: string; verified: boolean; editing: boolean; onVerified: () => void }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [sent, setSent] = useState<string | null>(null); const [code, setCode] = useState(""); const [err, setErr] = useState<string | null>(null);
  if (editing) return <p className="mt-1.5 text-[12px] text-steel" data-me-email-state="editing">Save, then verify by code</p>;
  if (!email) return <p className="mt-1.5 text-[12px] text-steel" data-me-email-state="none">Needed to reset a password</p>;
  if (verified) return <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--color-green)]" data-me-email-state="verified"><MailCheck size={14} aria-hidden /> Verified</p>;
  return (
    <div className="mt-2 rounded-2xl bg-[var(--color-orange-2)] p-3" data-me-email-state="unverified">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[color-mix(in_srgb,var(--color-orange)_78%,var(--color-label))] flex-1 min-w-[12rem]"><Mail size={14} aria-hidden /> Not verified</span>
        <button type="button" disabled={pending} className="btn btn-gray !h-11 !px-4 !rounded-full text-[13.5px] font-semibold" data-me-send-code
          onClick={() => start(async () => { setErr(null); const r = await sendMyCode(); if ("error" in r) { setErr(r.error ?? "Could not send."); return; } setSent(r.sent_to); toast(r.echoed ? `Code (mail is not set up here): ${r.echoed}` : `Code sent to ${r.sent_to}`); })}>
          {sent ? "Send again" : "Send a code"}</button>
      </div>
      {sent && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <input className="!w-40 !min-w-0 tracking-[.3em] num text-center" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="6 digits" aria-label="The code from your email" data-me-code />
          <button type="button" disabled={pending || code.length !== 6} className="svc-btn go sm !px-4" data-me-verify
            onClick={() => start(async () => { setErr(null); const r = await verifyMyCode(code); if ("error" in r) { setErr(r.error ?? "That code is not right."); return; } onVerified(); toast("Email verified"); })}><Check size={16} aria-hidden /> Verify</button>
        </div>)}
      {err && <p className="mt-2 text-[13px] font-semibold text-chili" role="alert">{err}</p>}
    </div>
  );
}

/** Today at a glance: my attendance, my checklists, my open jobs — each a way into its screen. */
function Today({ day }: { day: Day }) {
  const rows: { key: string; href: string; icon: React.ReactNode; tint: string; title: string; sub: string }[] = [
    ...(day.attendance ? [{ key: "attendance", href: "/attendance", icon: <Clock3 size={18} />, tint: "var(--color-blue)", title: "My attendance",
      sub: day.attendance.in_at ? `In at ${hm(day.attendance.in_at)}${day.attendance.out_at ? ` · out at ${hm(day.attendance.out_at)}` : " · still in"}` : "Not punched in yet today" }] : []),
    { key: "lists", href: "/tasks", icon: <ListChecks size={18} />, tint: "var(--color-green)", title: "My checklists",
      sub: day.lists ? `${day.listsDone} of ${day.lists} done today` : "No lists for you yet" },
    { key: "jobs", href: "/work", icon: <ListTodo size={18} />, tint: "var(--color-orange)", title: "My jobs",
      sub: day.jobs ? `${day.jobs} open — given to you or taken by you` : "Nothing open on you" },
  ];
  return (
    <Card data-me-work>
      <Head icon={<CalendarCheck size={18} />} title="Today" sub="At a glance" />
      <div className="divide-y divide-[var(--color-separator)] -mx-1">
        {rows.map((r) => (
          <Link key={r.key} href={r.href} className="flex items-center gap-3 px-1 py-2.5 !min-h-14 rounded-xl hover:bg-[var(--color-fill)] transition-colors" data-me-today={r.key}>
            <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center" style={{ background: `color-mix(in srgb, ${r.tint} 16%, transparent)`, color: `color-mix(in srgb, ${r.tint} 82%, var(--color-label))` }}>{r.icon}</span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">{r.title}</span><span className="block text-[12.5px] text-steel truncate">{r.sub}</span></span>
            <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
          </Link>))}
      </div>
    </Card>
  );
}

/** My sign-in (redrawn 2026-10-23, the owner: "ultra modern, fits every screen"): the ID on a tinted pass with a copy
 *  key, then two tiles — Password and Other devices — side by side where there is room (auto-fit, 14rem each), stacked on a
 *  phone. Sign out others asks first, in a sheet, not the browser's confirm box. */
function Security({ me }: { me: Me }) {
  const toast = useToast(); const [pending, start] = useTransition(); const [ask, setAsk] = useState(false);
  const tile = "flex items-center gap-3 min-h-[72px] w-full rounded-[18px] bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] px-3.5 py-3 text-left transition-colors min-w-0";
  const bubble = (tint: string) => ({ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: `color-mix(in srgb, ${tint} 82%, var(--color-label))` });
  return (
    <Card data-me-security>
      <Head icon={<KeyRound size={18} />} title="Sign-in & security" sub="Your keys to DineFlow" />
      <div className="flex items-center gap-3 rounded-[20px] border border-[color-mix(in_srgb,var(--color-tint)_28%,transparent)] px-4 py-3.5 min-w-0"
        style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--color-tint) 14%, transparent), color-mix(in srgb, var(--color-tint) 4%, transparent))" }} data-me-pass>
        <span className="h-11 w-11 shrink-0 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-tint)] shadow-[0_1px_4px_rgb(0_0_0/0.16)]"><ShieldCheck size={20} aria-hidden /></span>
        <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-[.1em] text-steel">Sign-in ID</span>
          <span className="block text-[15.5px] font-semibold leading-snug [overflow-wrap:anywhere]" data-me-login>{me.login || "—"}</span></span>
        {me.login && <button type="button" onClick={() => { void copyText(me.login!); toast("Sign-in ID copied"); }} aria-label="Copy sign-in ID"
          className="shrink-0 h-10 w-10 !min-h-10 pointer-coarse:h-11 pointer-coarse:w-11 rounded-full grid place-items-center bg-[var(--color-bg-2)] hover:brightness-110 text-[var(--color-label)]"><Copy size={16} aria-hidden /></button>}
      </div>
      <div className="mt-3 grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]">
        <a href="/account/password" className={tile} data-me-password>
          <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center" style={bubble("var(--color-blue)")}><Lock size={18} aria-hidden /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">Password</span><span className="block text-[12.5px] text-steel">Change by email code</span></span>
          <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
        </a>
        <button type="button" disabled={pending} className={tile} onClick={() => setAsk(true)} data-me-signout-others>
          <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center" style={bubble("var(--color-orange)")}><MonitorSmartphone size={18} aria-hidden /></span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">Other devices</span><span className="block text-[12.5px] text-steel">Sign out all but this</span></span>
          <ChevronRight size={18} className="shrink-0 text-[var(--color-label-3)]" aria-hidden />
        </button>
      </div>
      <div className="mt-3 text-[12.5px] text-steel">Forgot it? <Link href="/forgot" className="tap font-semibold text-[var(--color-label)] underline underline-offset-2">Reset</Link></div>
      <Sheet open={ask} onClose={() => setAsk(false)} title="Sign out other devices?">
        <div className="space-y-4" data-me-signout-ask>
          <p className="text-[14px] text-steel">Every other phone and computer signs out. This one stays in.</p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={pending} data-me-signout-yes onClick={() => start(async () => { const r = await signOutOthers(); setAsk(false); toast("error" in r ? r.error! : "Signed out on every other device", "error" in r ? "err" : undefined); })}><MonitorSmartphone size={16} aria-hidden /> Sign out others</Button>
            <Button variant="gray" onClick={() => setAsk(false)}>Cancel</Button>
          </div>
        </div>
      </Sheet>
    </Card>
  );
}

/** Assist on this device (2026-10-24): a drag to the close mark puts the button away (components/assist/Assist.tsx); this brings
 *  it back. The key is the Assist bubble's own (df-assist-hidden), written here so this page never loads Assist's code. */
function AssistSwitch() {
  const [on, setOn] = useState(true);
  useEffect(() => { try { setOn(localStorage.getItem("df-assist-hidden") !== "1"); } catch { /* shown */ } }, []);
  const flip = () => { const v = !on; setOn(v); try { if (v) localStorage.removeItem("df-assist-hidden"); else localStorage.setItem("df-assist-hidden", "1"); } catch { /* this visit */ } window.dispatchEvent(new Event("df-assist")); };
  return (
    <label className="mt-6 flex items-center gap-3 rounded-2xl border border-[var(--color-separator)] p-3 cursor-pointer" data-me-assist>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">Show Assist</span><span className="block text-[12.5px] text-steel">The AI helper button on this device</span></span>
      <button type="button" role="switch" aria-checked={on} data-on={on ? "true" : "false"} className="switch shrink-0" onClick={flip} aria-label="Show Assist" />
    </label>
  );
}
