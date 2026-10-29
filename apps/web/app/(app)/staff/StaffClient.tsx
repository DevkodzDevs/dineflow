"use client";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Copy, UserPlus, KeyRound, Check, MailWarning, MailCheck, Mail, Hash, Users, Network, BookOpen, Briefcase, Search, Ticket, ShieldCheck, UserCheck, Building2, AlertCircle, Phone, CalendarDays, X, LayoutDashboard, LayoutGrid, Rows3, Clock3, ChevronLeft, ChevronRight } from "lucide-react";
import { SlidersHorizontal as AccessIcon, Plug, BarChart3 } from "lucide-react";
import { Button, Field, Sheet, cn, useToast, FlapShuffle } from "@/components/ui";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";
import { ROLE_LABEL, ROLE_HINT, ROLE_ACCESS, ROLE_DEFAULT, MODULE_GROUPS, MODULES_BY_TYPE, ALWAYS_ON, LEVELS, rolesIMayAssign, canManage, suggestedRole, positionByKey, departmentByKey, hierarchyFor, positionModules, sameModules, type Role, type PropertyType } from "@dineflow/shared";
import { createInvite, setAccess, setPasswordRight, setAssistAccess, setGrant, addStaff, staffLogin, resetStaffPassword, sendStaffVerification, verifyStaffContact, setPosition, setEmergency } from "./actions";
import { PositionFields, TeamChart, PositionsGuide, Avatar, DeptIcon, ModuleChips, titleOf, deptOf, levelFor, DEPT_ORDER, deptHue } from "./StaffPositions";
import { StaffGrid, type Duty } from "./StaffGrid";
import { copyText } from "@/lib/clipboard";
import { Say } from "@/components/ui/Say";

/** One switch in a list (Access, Add staff, Active): the words on the left, the switch on the right, centred on one
 *  line at every width, and the whole row is the tap target (the switch is the label's control). Not `.group > .row`
 *  (2026-10-20): under 640px that rule wraps and gave the words the full width, which put every switch on a line of
 *  its own under its description — the owner's "switch alignment placing is not good". */
function SwitchRow({ title, hint, on, onToggle, icon, data }: { title: string; hint?: string; on: boolean; onToggle: () => void; icon?: ReactNode; data?: Record<string, string> }) {
  return (
    <label className="flex items-center gap-3.5 min-h-[64px] px-4 sm:px-[18px] py-3 cursor-pointer select-none transition-colors hover:bg-[var(--color-fill)] active:bg-[var(--color-fill)]" data-switch-row>
      {icon && <span className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)]" aria-hidden>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-[var(--color-label)] [overflow-wrap:anywhere]">{title}</span>
        {hint && <span className="block mt-0.5 text-[13px] leading-snug text-steel [overflow-wrap:anywhere]">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} data-on={on ? "true" : "false"} className="switch shrink-0" onClick={onToggle} {...data} />
    </label>
  );
}
/** A card of switch rows, a hairline between each. */
const SWITCH_GROUP = "group divide-y divide-[var(--color-separator)]";

/** The slip you hand over (redrawn 2026-10-23, the owner: "why does this look like this"): the login ID and — only for
 *  whoever may issue one (0136) — the temporary password, each on its own row with a round copy key; the password large
 *  and spaced so it can be read out. No password: one line saying they keep their own, and who can reset it. */
function Credentials({ title, loginId, password, staffCode, canIssue }: { title: string; loginId: string; password: string | null; staffCode?: string | null; canIssue: boolean }) {
  const toast = useToast();
  const copy = (text: string, what: string) => { void copyText(text); toast(`${what} copied`); };
  const key = "shrink-0 h-10 w-10 !min-h-10 pointer-coarse:h-11 pointer-coarse:w-11 rounded-full grid place-items-center bg-[var(--color-fill)] text-[var(--color-label)] hover:bg-[var(--color-fill-2)] transition-colors";
  return (
    <div className="rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-credentials>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <span className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-[.08em] text-steel truncate">{title}</span>
        {staffCode && <span className="pill pill-gold num shrink-0">{staffCode}</span>}
      </div>
      <div className="divide-y divide-[var(--color-separator)] border-t border-[var(--color-separator)]">
        <div className="flex items-center gap-3 px-4 py-3 min-w-0">
          <span className="min-w-0 flex-1"><span className="block text-[11px] font-bold uppercase tracking-[.08em] text-steel">Login ID</span>
            <span className="block num text-[16px] font-semibold [overflow-wrap:anywhere]" data-cred-login>{loginId}</span></span>
          <button type="button" className={key} onClick={() => copy(loginId, "Login ID")} aria-label="Copy login ID"><Copy size={16} aria-hidden /></button>
        </div>
        {password ? (
          <div className="flex items-center gap-3 px-4 py-3 min-w-0 bg-[color-mix(in_srgb,var(--color-tint)_7%,transparent)]">
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.08em] text-steel">Temporary password<span className="rounded-full px-2 py-px text-[10.5px] tracking-normal normal-case bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]">3 days</span></span>
              <span className="block num text-[22px] font-bold tracking-[.12em] [overflow-wrap:anywhere]" data-cred-password>{password}</span></span>
            <button type="button" className={key} onClick={() => copy(password, "Password")} aria-label="Copy password"><Copy size={16} aria-hidden /></button>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 text-[13.5px] text-steel" data-cred-own>
            <ShieldCheck size={17} className="shrink-0 text-[var(--color-green)]" aria-hidden />
            <span className="min-w-0">{canIssue ? "Own password set" : "Own password · owner resets"}</span>
          </div>
        )}
      </div>
      {password && <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[var(--color-separator)] text-[12.5px] text-steel" data-cred-next>
        <KeyRound size={14} className="shrink-0" aria-hidden /><span>Changed on first sign-in</span></div>}
    </div>
  );
}

type Staff = { id: string; full_name: string; email: string | null; phone: string | null; contact_email: string | null; contact_verified_at: string | null; staff_code: string | null; role: Role; is_active: boolean; allowed_modules: string[] | null; must_change_password: boolean;
  position: string | null; position_title: string | null; department: string | null; reports_to: string | null; joined_on: string | null; can_issue_passwords?: boolean; assist_access?: boolean; grants?: string[] | null };
type Pos = { department: string; position: string; title: string; reportsTo: string; joinedOn: string };
const posOf = (p?: Staff | null): Pos => ({ department: p ? deptOf(p) ?? "" : "", position: p?.position ?? "", title: p?.position_title ?? "", reportsTo: p?.reports_to ?? "", joinedOn: p?.joined_on ?? "" });
const samePos = (a: Pos, b: Pos) => a.department === b.department && a.position === b.position && a.title.trim() === b.title.trim() && a.reportsTo === b.reportsTo && a.joinedOn === b.joinedOn;
const savePos = (id: string, v: Pos) => setPosition(id, { position: v.position || null, department: v.department || null, title: v.title, reportsTo: v.reportsTo || null, joinedOn: v.joinedOn || null });
type Invite = { code: string; role: Role; expires_at: string };

/** A phone as people read it out: "9845011223" → "98450 11223", "+919845011223" → "+91 98450 11223"; else as written. */
const phoneOut = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return raw;
};

/** One fact on a person's card (2026-10-20): a small icon in a tinted circle, a quiet caption, the value. */
function Fact({ icon, tint, caption, title, className, children, ...rest }: { icon: ReactNode; tint: string; caption: string; title?: string; className?: string; children: ReactNode } & Record<`data-${string}`, string>) {
  return (
    <div className={cn("min-w-0 flex items-center gap-2.5", className)} title={title} {...rest}>
      <span className="h-7 w-7 shrink-0 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }} aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)]">{caption}</span>
        <span className="block mt-0.5 text-[13px] font-semibold text-[var(--color-label)] truncate">{children}</span>
      </span>
    </div>
  );
}

const LAYOUT_KEY = "df-staff-layout";
export function StaffClient({ me, myRole, myModules, type, enabled, staff, invites, loginDomain, onDuty = 0, duty = [], canIssue = false }: { me: string; myRole: Role; myModules: string[]; type: PropertyType; enabled: string[] | null; staff: Staff[]; invites: Invite[]; loginDomain: string; onDuty?: number; duty?: Duty[]; canIssue?: boolean }) {
  /* temporary passwords (0136): the owner's switch on each manager, shown at once and saved behind */
  const [issue, setIssue] = useState<Record<string, boolean>>({});
  const issueOn = (p: Staff) => issue[p.id] ?? !!p.can_issue_passwords;
  /* Assist (0138): the top three have it; anyone below, when the owner or a manager switches it on */
  const [aiOn, setAiOn] = useState<Record<string, boolean>>({});
  const assistOn = (p: Staff) => aiOn[p.id] ?? !!p.assist_access;
  /* Connections and Reports (0140): the owner's, and the manager or supervisor the owner switches them on for */
  const [grantOn, setGrantOn] = useState<Record<string, string[]>>({});
  const grantsOf = (p: Staff) => grantOn[p.id] ?? (p.grants ?? []);
  const flipGrant = (p: Staff, g: "connections" | "reports") => { const cur = grantsOf(p), on = !cur.includes(g); const next = on ? [...cur, g] : cur.filter((x) => x !== g); setGrantOn((m) => ({ ...m, [p.id]: next })); start(async () => { const r = await setGrant(p.id, g, on); if ("error" in r) { setGrantOn((m) => ({ ...m, [p.id]: cur })); setErr(r.error!); } else toast(on ? `${p.full_name} can now open ${g === "reports" ? "Reports" : "Connections"}` : `${g === "reports" ? "Reports" : "Connections"} is off for ${p.full_name}`); }); };
  const toast = useToast();
  // the ranks below mine — the only ones I may appoint anyone to
  const assignable = rolesIMayAssign(myRole);
  const [acc, setAcc] = useState<Staff | null>(null); const [role, setRole] = useState<Role>(assignable[assignable.length - 1] ?? "employee"); const [ticks, setTicks] = useState<string[] | null>(null); const [active, setActive] = useState(true); const [err, setErr] = useState<string | null>(null);
  const openAccess = (p: Staff) => { setAcc(p); setRole(p.role); setTicks(p.allowed_modules); setActive(p.is_active); setErr(null); setAccPos(posOf(p)); };
  /* positions (0107): what each person is — department, title, level — as against the role that opens screens */
  const [accPos, setAccPos] = useState<Pos>(posOf(null));
  const [view, setView] = useState<"people" | "chart" | "guide">("people");
  /* Cards or the grid (2026-10-22). "auto" until this device picks one: CSS shows the grid from md and the cards below it.
     A pick is kept on the device (localStorage df-staff-layout), read after mount so the server render and the first
     paint agree. `wide` only lights the right half of the switch while it is still on auto. */
  /* 2026-10-25: the app's one ViewSwitch (a tap for this visit, the pin for this device's default); a pick kept before under
     df-staff-layout reads as pinned. */
  const lay = useViewPref("staff", ["cards", "table"] as const, { legacy: LAYOUT_KEY });
  const layout = lay.chosen ?? "auto";
  const shownAs = lay.chosen ?? (lay.wide === null ? null : lay.wide ? "table" : "cards");
  /* a row of the grid opens the person: their card, today, the sections they open, who they report to and who reports to them */
  const [detail, setDetail] = useState<Staff | null>(null);
  const [dept, setDept] = useState<string | null>(null);
  const [selfEdit, setSelfEdit] = useState<Staff | null>(null); const [selfPos, setSelfPos] = useState<Pos>(posOf(null)); const [selfErr, setSelfErr] = useState<string | null>(null);
  const depts = hierarchyFor(type).map((d) => ({ ...d, n: staff.filter((p) => deptOf(p) === d.key).length })).filter((d) => d.n > 0);
  const unplaced = staff.filter((p) => !deptOf(p)).length;
  const chips: Chip[] = [{ key: null, label: "All", n: staff.length }, ...depts.map((d) => ({ key: d.key as string | null, label: d.label, n: d.n })), ...(unplaced ? [{ key: "none", label: "No position", n: unplaced }] : [])];
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase(); const digits = needle.replace(/\D/g, "");
  const shown = staff.filter((p) => dept === null || (dept === "none" ? !deptOf(p) : deptOf(p) === dept))
    .filter((p) => !needle || [p.full_name, titleOf(p), p.staff_code ?? "", p.email ?? "", departmentByKey(deptOf(p))?.label ?? ""].some((x) => x.toLowerCase().includes(needle)) || (digits.length >= 3 && (p.phone ?? "").includes(digits)))
    .sort((a, b) => DEPT_ORDER(deptOf(a)) - DEPT_ORDER(deptOf(b)) || (levelFor(a, type) ?? 9) - (levelFor(b, type) ?? 9) || a.full_name.localeCompare(b.full_name));
  /**
   * What I may tick for them: the property type ∩ their role's ceiling ∩ the master's set — and then
   * only the sections I hold myself. That last clause is the delegation rule: a supervisor who runs
   * the kitchen cannot hand anyone the till. The database enforces the same clamp, so this is the
   * form being honest rather than the form being the guard.
   */
  const ceiling = (r: Role) => MODULES_BY_TYPE[type].filter((m) =>
    ROLE_ACCESS[r].includes(m)
    && (!enabled || enabled.includes(m) || (ALWAYS_ON as readonly string[]).includes(m))
    && (myRole === "owner" || myModules.includes(m)));
  /** a position's sections (job-based defaults, as Toast and Petpooja set staff up), trimmed to the role's ceiling and to
   *  what I hold myself — or null (the role's own default) for a position that opens everything its role allows */
  const posTicks = (key: string | null | undefined, r: Role): string[] | null => { const m = positionModules(key, type, MODULES_BY_TYPE); return m === null ? null : m.filter((x) => ceiling(r).includes(x)); };
  const posOpens = (p: Staff) => posTicks(p.position, p.role);
  /** No ticks = the role's default (ROLE_DEFAULT), which for a job role is its own screens, narrower than its ceiling since
   *  2026-10-20 — so the sheet shows exactly what that person opens, and the first tap starts from it. */
  const byDefault = (r: Role) => ceiling(r).filter((x) => x !== "dashboard" && ROLE_DEFAULT[r].includes(x));
  const isOn = (k: string) => ticks === null ? byDefault(role).includes(k) : ticks.includes(k);
  const toggle = (k: string) => { const base = ticks === null ? byDefault(role) : ticks; setTicks(base.includes(k) ? base.filter((x) => x !== k) : [...base, k]); };
  /** The control room is the owner's to give, and only to a manager (constants.ts controlRoomFor). */
  const controlRoomSwitch = (list: string[] | null, r: Role, onToggle: () => void) => myRole === "owner" && r === "manager" ? (
    <div className={cn(SWITCH_GROUP, "mb-4")} data-control-room-switch>
      <SwitchRow title="Control room" hint="Sales, money, every team"
        icon={<LayoutDashboard size={19} />} on={!!list?.includes("dashboard")} onToggle={onToggle} data={{ "data-control-room": "" }} /></div>) : null;
  const [open, setOpen] = useState(false); const [code, setCode] = useState<string | null>(null); const [pending, start] = useTransition();
  // adding someone outright, and the slip that comes back
  const [add, setAdd] = useState(false);
  const [addRole, setAddRole] = useState<Role>(assignable[assignable.length - 1] ?? "employee");
  const [addTicks, setAddTicks] = useState<string[] | null>(null);
  const [addPos, setAddPos] = useState<Pos>(posOf(null));
  /** choosing a position suggests its access — brought down to one I may give — and the owner can still change it */
  const pickAddPos = (v: Pos) => {
    setAddPos(v);
    if (v.position === addPos.position) return;
    const r = suggestedRole(positionByKey(v.position), assignable.filter((x) => x !== "owner")) ?? addRole;
    setAddRole(r); setAddTicks(posTicks(v.position, r));
  };
  const [made, setMade] = useState<{ title: string; staff_code?: string | null; login_id: string; temp_password: string | null; verify?: { userId: string; email: string; mailed: boolean; mailError?: string | null; echoed?: string } } | null>(null);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [otp, setOtp] = useState(""); const [otpDone, setOtpDone] = useState(false); const [otpErr, setOtpErr] = useState<string | null>(null);
  const addOn = (k: string) => addTicks === null ? true : addTicks.includes(k);
  const addToggle = (k: string) => { const base = addTicks === null ? ceiling(addRole).filter((x) => x !== "dashboard") : addTicks; setAddTicks(base.includes(k) ? base.filter((x) => x !== k) : [...base, k]); };
  const openAdd = () => { setAdd(true); setMade(null); setAddErr(null); setAddRole(assignable[assignable.length - 1] ?? "employee"); setAddTicks(null); setAddPos(posOf(null)); };
  // the slip for someone already on the list
  const showLogin = (p: Staff) => start(async () => {
    const r = await staffLogin(p.id);
    if ("error" in r) { setAddErr(r.error!); return; }
    setMade({ title: p.full_name, staff_code: p.staff_code, login_id: r.login_id, temp_password: r.temp_password }); setAdd(true);
  });
  const resetPw = (p: Staff) => start(async () => {
    const r = await resetStaffPassword(p.id);
    if ("error" in r) { setAddErr(r.error!); return; }
    setMade({ title: `${p.full_name} · new password`, staff_code: p.staff_code, login_id: r.login_id, temp_password: r.temp_password }); setAdd(true);
  });
  const waiting = staff.filter((p) => p.must_change_password).length;
  const unconfirmed = staff.filter((p) => p.contact_email && !p.contact_verified_at).length;
  /* The page as a list, not a list squeezed beside a form. The two ways to add someone were a 340px
     column on the right; on an iPad or a laptop that column and a row of pills could not both fit,
     the column slid off the screen, and the pills printed over one another ("Not signed in" over
     "Owner"). Now: the actions in a bar on top, each person one row — who they are on the left, what
     state they are in on a line under their name, the two buttons on the right — and the invites and
     the how-to beside the list only where there is room for them (xl), under it everywhere else. */
  const active_ = staff.filter((p) => p.is_active).length;
  const noPos = staff.filter((p) => p.is_active && !p.position && p.role !== "owner").length;
  const attention = waiting + unconfirmed + noPos;
  const deptCount = new Set(staff.filter((p) => p.is_active).map(deptOf).filter(Boolean)).size;
  /* The page, top down: a header with the two ways to add someone and four figures (team, on duty, departments,
     what needs a hand); a segmented switch for People · Team chart · Positions; then the view. People are cards —
     initials on the department's colour with a dot for their state, the title, department and level, the role and
     any warnings as chips, the two actions along the foot — in a grid that is one column on a phone and four on a
     wide screen. Invites and the how-to sit under the cards. */
  /** How a person's sections were set, in a word: the position's, the role's default, or n chosen (none for the owner). */
  const howOf = (p: Staff) => p.role === "owner" ? null : p.position && sameModules(p.allowed_modules, posOpens(p)) ? "position access" : p.allowed_modules ? `${p.allowed_modules.length} sections${p.position ? " · custom" : ""}` : "default";
  /** One person's card — the People view's card, and the same card at the top of a person's details (2026-10-22). `close`
   *  shuts the details sheet before a foot action opens its own sheet. */
  const personCard = (p: Staff, close?: () => void) => {
      const mine = p.id !== me && canManage(myRole, p.role); const d = deptOf(p); const lv = levelFor(p, type); const hue = deptHue(d);
      const dot = !p.is_active ? "var(--color-red)" : p.must_change_password ? "var(--color-orange)" : "var(--color-green)";
      return (
        /* one person: a card with their department's colour along the top */
        <article key={p.id} data-person={p.id} className={cn("relative min-w-0 rounded-[24px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] overflow-hidden flex flex-col transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_-18px_rgb(0_0_0/0.5)]", !p.is_active && "opacity-70")}>
          <span className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${hue}, color-mix(in srgb, ${hue} 25%, transparent))` }} aria-hidden />
          <div className="p-4 pb-3 flex items-start gap-3.5 min-w-0">
            <Avatar name={p.full_name} dept={d} size={52} dot={dot} />
            <div className="min-w-0 flex-1">
              <div className={cn("text-[16.5px] font-extrabold leading-tight truncate", !p.is_active && "line-through text-steel")}>{p.full_name}{p.id === me && <span className="text-[12px] text-steel font-semibold"> · you</span>}</div>
              {/* their position (0107): the title, the department in its colour */}
              <div className="text-[14px] font-semibold truncate mt-0.5" data-position-line>{titleOf(p)}{departmentByKey(d) && <span className="sr-only"> · {departmentByKey(d)!.label}</span>}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[12.5px] min-w-0">
                {departmentByKey(d) ? <span className="inline-flex items-center gap-1 min-w-0 font-semibold" style={{ color: hue }}><DeptIcon dept={d} size={13} /><span className="truncate">{departmentByKey(d)!.label}</span></span> : <span className="text-steel">No position yet</span>}
              </div>
            </div>
            {lv && <span className="shrink-0 rounded-full px-2 h-7 grid place-items-center text-[12px] font-black num bg-[var(--color-fill)]" title={`Level ${lv} · ${LEVELS[lv - 1].label}`} data-level-badge>L{lv}</span>}
          </div>
          {/* the facts (2026-10-20 — the owner: "not good, make it modern and tidy"): one soft panel instead of loose
              chips and a loose line. Access across the top (the role, how it was set as a quiet pill); then Phone ·
              Staff code and Email · Joined in two even columns; a hairline line under them only for what needs
              saying — not signed in yet, switched off, who they report to. */}
          {(() => {
            const boss = p.reports_to ? staff.find((x) => x.id === p.reports_to) : null;
            const how = howOf(p);
            const mail = !p.contact_email ? { icon: <Mail size={14} />, tint: "var(--color-label-2)", text: "—", title: "No email on their record" }
              : p.contact_verified_at ? { icon: <MailCheck size={14} />, tint: "var(--color-green)", text: "Verified", title: p.contact_email }
              : { icon: <MailWarning size={14} />, tint: "var(--color-orange)", text: "Not verified", title: "Email not confirmed, so they can't reset their password" };
            const notes = [
              p.must_change_password && <span key="pw" title="Has not signed in and set their own password yet" className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--color-orange)]" aria-hidden />Not signed in</span>,
              !p.is_active && <span key="off" className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--color-red)]" aria-hidden />Off</span>,
              boss && <span key="boss" className="inline-flex items-center gap-1 min-w-0"><span aria-hidden>→</span><span className="truncate">{boss.full_name}</span></span>,
            ].filter(Boolean);
            return (
              <div className="px-4 pb-4" data-state>
                <div className="rounded-2xl bg-[var(--color-fill)] border border-[var(--color-separator)] p-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2.5">
                    <div className="col-span-2 min-w-0 flex items-center gap-2.5" data-access>
                      <span className="h-7 w-7 shrink-0 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 18%, transparent)`, color: hue }} aria-hidden><ShieldCheck size={14} /></span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)]">Access</span>
                        <span className="block mt-0.5 text-[13.5px] font-bold text-[var(--color-label)] truncate">{ROLE_LABEL[p.role]}</span>
                      </span>
                      {how && <span className="shrink-0 max-w-[55%] truncate h-6 px-2.5 rounded-full inline-flex items-center text-[11.5px] font-semibold text-[var(--color-label-2)] bg-[var(--color-bg-2)] border border-[var(--color-separator)]">{how}</span>}
                    </div>
                    <Fact icon={<Phone size={14} />} tint="var(--color-green)" caption="Phone" title={p.phone ?? undefined}><span className="num">{p.phone ? phoneOut(p.phone) : "—"}</span></Fact>
                    <Fact icon={<Hash size={14} />} tint="var(--color-blue)" caption="Staff code"><span className="num">{p.staff_code ?? "—"}</span></Fact>
                    <Fact icon={mail.icon} tint={mail.tint} caption="Email" title={mail.title} data-email-state={p.contact_email ? (p.contact_verified_at ? "verified" : "unverified") : "none"}>{mail.text}</Fact>
                    <Fact icon={<CalendarDays size={14} />} tint="var(--color-violet)" caption="Joined">{p.joined_on ? new Date(p.joined_on + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</Fact>
                  </div>
                  {notes.length > 0 && <div className="mt-2.5 pt-2.5 border-t border-[var(--color-separator)] flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-[var(--color-label-2)] min-w-0">{notes}</div>}
                </div>
              </div>
            );
          })()}
          {/* the foot (2026-10-20): Call — when they have a phone and are not me — then Sign-in and Access for someone I
              manage, or the owner's own Your position. Equal sections, hairlines between; under 19.5rem of card the
              icon goes over the word so three still fit a phone. */}
          {(() => {
            const acts: { key: string; label: string; icon: ReactNode; href?: string; onClick?: () => void; aria: string; data?: Record<string, string>; cls?: string }[] = [];
            if (p.phone && p.id !== me) acts.push({ key: "call", label: "Call", icon: <Phone size={16} className="text-[var(--color-green)]" aria-hidden />, href: `tel:${p.phone.replace(/\s/g, "")}`, aria: `Call ${p.full_name} on ${p.phone}`, data: { "data-call": "" } });
            if (mine) {
              acts.push({ key: "login", label: "Sign-in", icon: <KeyRound size={16} aria-hidden />, onClick: () => { close?.(); showLogin(p); }, aria: `Sign-in details for ${p.full_name}`, cls: "text-[var(--color-label-2)] hover:text-[var(--color-label)]" });
              acts.push({ key: "access", label: "Access", icon: <AccessIcon size={16} aria-hidden />, onClick: () => { close?.(); openAccess(p); }, aria: `Access for ${p.full_name}` });
            } else if (p.id === me && myRole === "owner") acts.push({ key: "own", label: "Your position", icon: <Briefcase size={16} aria-hidden />, onClick: () => { close?.(); setSelfEdit(p); setSelfPos(posOf(p)); setSelfErr(null); }, aria: "Your position", data: { "data-own-position": "" } });
            if (!acts.length) return <div className="mt-auto" />;
            return (
              <div className="@container mt-auto grid border-t border-[var(--color-separator)] divide-x divide-[var(--color-separator)]" style={{ gridTemplateColumns: `repeat(${acts.length}, minmax(0, 1fr))` }} data-actions>
                {acts.map((a) => {
                  const cls = cn("min-w-0 !min-h-12 !rounded-none px-1.5 py-1.5 inline-flex flex-col items-center justify-center gap-1 text-[12px] font-bold whitespace-nowrap hover:bg-[var(--color-fill)] disabled:opacity-40 focus-visible:!outline-offset-[-3px]",
                    "@[19.5rem]:flex-row @[19.5rem]:gap-2 @[19.5rem]:text-[13.5px]", a.cls);
                  const body = <>{a.icon}<span className="truncate max-w-full">{a.label}</span></>;
                  return a.href
                    ? <a key={a.key} href={a.href} aria-label={a.aria} title={a.aria} className={cls} {...a.data}>{body}</a>
                    : <button key={a.key} type="button" disabled={a.key === "login" && pending} onClick={a.onClick} aria-label={a.aria} title={a.aria} className={cls} {...a.data}>{body}</button>;
                })}
              </div>);
          })()}
        </article>
      );
  };
  return (
    <div className="space-y-5" data-staff>
      {/* ── header ── */}
      <section className="relative overflow-hidden rounded-[28px] border border-[var(--color-separator)] p-5 sm:p-7" data-staff-hero
        style={{ background: "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--color-tint) 16%, transparent) 0%, transparent 55%), var(--color-bg-2)" }}>
        <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-steel">Your team</div>
            <div role="heading" aria-level={1} className="font-display text-[40px] sm:text-[52px] leading-[1.02] mt-1">Staff</div>
            <p className="text-[14.5px] text-[var(--color-label-2)] mt-2 max-w-xl">Roles, teams and access</p>
          </div>
          <div className={cn("grid md:flex gap-2 shrink-0", canIssue ? "grid-cols-2" : "grid-cols-1")}>
            <button type="button" className="svc-btn quiet sm !px-4" onClick={() => { setCode(null); setOpen(true); }} data-invite-open><Ticket size={17} aria-hidden /> <span className="sm:hidden">Invite</span><span className="hidden sm:inline">Invite with a code</span></button>
            {canIssue && <button type="button" className="svc-btn go sm !px-5" onClick={openAdd} data-add-staff><UserPlus size={18} aria-hidden /><Say w="add_staff" /></button>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2.5" data-staff-stats>
          {([
            [Users, "Team", String(active_), staff.length > active_ ? `${staff.length - active_} switched off` : `${staff.length === 1 ? "person" : "people"} active`, "var(--color-blue)"],
            [UserCheck, "On duty today", String(onDuty), `of ${active_} in`, "var(--color-green)"],
            [Building2, "Departments", String(deptCount), `of ${hierarchyFor(type).length}`, "var(--color-violet)"],
            [AlertCircle, "Needs a hand", String(attention), attention ? [waiting && `${waiting} not signed in`, unconfirmed && `${unconfirmed} email`, noPos && `${noPos} no position`].filter(Boolean).join(" · ") : "all set", attention ? "var(--color-orange)" : "var(--color-green)"],
          ] as const).map(([I, k, v, sub, hue]) => (
            <div key={k} className="min-w-0 rounded-[20px] bg-[color-mix(in_srgb,var(--color-fill)_70%,transparent)] px-4 py-3 flex items-center gap-3" data-stat={k}>
              <span className="h-10 w-10 shrink-0 rounded-[13px] grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 20%, transparent)`, color: hue }}><I size={19} aria-hidden /></span>
              <div className="min-w-0"><div className="text-[12px] font-bold text-steel truncate">{k}</div>{k === "On duty today"   /* 2026-10-20: the one live count here shuffles when someone punches in or out (Flap.tsx) */
                  ? <div className="mt-1"><FlapShuffle value={v} pad={0} size="xs" tile="34px" bare say={`${v} on duty today`} /></div>
                  : <div className="font-display num text-[26px] leading-none mt-0.5">{v}</div>}<div className="text-[11.5px] text-steel leading-snug mt-1 line-clamp-2">{sub}</div></div>
            </div>))}
        </div>
      </section>

      {/* ── People · Team chart · Positions (0107) ── */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="grid grid-cols-3 rounded-full bg-[var(--color-fill)] p-1 lg:w-auto w-full" role="tablist" aria-label="Staff view">
          {([["people", "people", Users], ["chart", "team_chart", Network], ["guide", "positions", BookOpen]] as const).map(([k, w, I]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} data-staff-view={k}
              className={cn("!min-h-11 rounded-full px-3 sm:px-5 inline-flex items-center justify-center gap-2 text-[13.5px] sm:text-[14px] font-extrabold transition-colors whitespace-nowrap", view === k ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_4px_rgb(0_0_0/0.22)]" : "text-steel hover:text-[var(--color-label)]")}><I size={16} aria-hidden /><Say w={w} /></button>))}
        </div>
        {view === "people" && <div className="flex items-center gap-2 lg:flex-1 min-w-0">
          <div className="relative flex-1 md:max-w-md min-w-0"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
            <input className="!h-12 !rounded-full !pl-11 !pr-11" placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find someone" data-staff-search />
            {q && <button type="button" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 !min-h-9 rounded-full grid place-items-center text-steel hover:bg-[var(--color-fill)]" aria-label="Clear"><X size={16} /></button>}</div>
          {/* Cards · Table (2026-10-22): the cards as they were, or the data grid; the default is the grid from an iPad up */}
          <div className="ml-auto shrink-0" data-staff-layout><ViewSwitch label="Show staff as" data="staff" shown={shownAs} onPick={lay.pick} saved={lay.saved}
            onKeep={(v) => { lay.keep(v); toast(v === "table" ? "The table is your default here" : "Cards are your default here"); }}
            options={[{ v: "cards", label: "Cards", icon: LayoutGrid, word: "Cards" }, { v: "table", label: "Table", icon: Rows3, word: "Table" }]} /></div>
        </div>}
      </div>

      {/* the department chips: one compact rail from md (DeptRail, 2026-10-22); the phone keeps its own sliding row */}
      {view === "people" && depts.length > 0 && <DeptRail chips={chips} value={dept} onPick={setDept} />}
      {view === "people" && depts.length > 0 && (
        <div className="md:hidden rail-fade flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:![mask-image:none] [scrollbar-width:none]" role="group" aria-label="Department" data-dept-chips="phone">
          {chips.map((d) => (
            <button key={d.key ?? "all"} type="button" aria-pressed={dept === d.key} onClick={() => setDept(d.key)} className={cn("shrink-0 !min-h-11 rounded-full pl-2 pr-2 inline-flex items-center gap-2 text-[13.5px] font-bold border transition-colors", dept === d.key ? "bg-[var(--color-label)] text-[var(--color-on-label)] border-transparent" : "bg-[var(--color-bg-2)] border-[var(--color-separator)] hover:bg-[var(--color-fill)]")}>
              <span className="h-7 w-7 rounded-full grid place-items-center" style={d.key && d.key !== "none" ? { background: `color-mix(in srgb, ${deptHue(d.key)} 22%, transparent)`, color: deptHue(d.key) } : { background: "var(--color-fill)" }}>{d.key === null ? <Users size={14} aria-hidden /> : <DeptIcon dept={d.key === "none" ? null : d.key} size={14} />}</span>
              {d.label}<b className="num min-w-6 h-6 px-1.5 rounded-full grid place-items-center text-[12px] bg-[color-mix(in_srgb,currentColor_12%,transparent)]">{d.n}</b></button>))}
        </div>)}
      {view === "chart" && <TeamChart type={type} people={staff} />}
      {view === "guide" && <PositionsGuide type={type} people={staff} />}

      <div className={cn("space-y-5", view !== "people" && "hidden")}>
        {/* Cards or the grid. Until someone picks on this device, CSS picks — cards on a phone, the grid from md (768, every
            iPad) — so the first paint is right at every width with nothing to correct after load. */}
        <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4", layout === "auto" ? "md:hidden" : layout === "table" && "hidden")} data-people>
          {shown.map((p) => personCard(p))}
          {staff.length === 0 && <p className="p-6 text-sm text-steel">No staff yet</p>}
          {staff.length > 0 && shown.length === 0 && <p className="p-6 text-sm text-steel sm:col-span-2">No match</p>}
        </div>
        <div className={cn(layout === "auto" ? "hidden md:block" : layout === "cards" && "hidden")}>
          {staff.length === 0
            ? <p className="p-6 text-sm text-steel rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)]">No staff yet</p>
            : <StaffGrid people={shown} everyone={staff} type={type} me={me} duty={duty} howOf={howOf} phoneOut={phoneOut} onOpen={(p) => setDetail(p)} />}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4">
            <div className="flex items-center gap-2 mb-2"><Ticket size={16} className="text-steel" aria-hidden /><span className="text-[13px] font-bold uppercase tracking-wide text-steel flex-1">Open invites</span>{invites.length > 0 && <span className="num text-xs text-steel">{invites.length}</span>}</div>
            {invites.length === 0 && <p className="text-sm text-steel">None open</p>}
            <ul className="space-y-2">{invites.map((i) => <li key={i.code} className="flex items-center justify-between gap-2 text-sm rounded-xl bg-[var(--color-fill)] px-3 py-2"><span className="num font-semibold tracking-wider">{i.code}</span><span className="text-[12px] font-semibold text-steel">{ROLE_LABEL[i.role]}</span></li>)}</ul>
          </div>
          {/* the two ways in as the two buttons they are (2026-10-24, the owner: "design") — each a tile with its icon, what
              it does and a chevron, opening Add staff or the invite sheet; it was two sentences in grey */}
          <div className="rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] p-4" data-two-ways>
            <div className="flex items-center gap-2 mb-3"><UserCheck size={16} className="text-steel" aria-hidden /><span className="text-[13px] font-bold uppercase tracking-wide text-steel">Two ways in</span></div>
            <div className="grid gap-2">
              {canIssue && <button type="button" onClick={openAdd} data-way="add"
                className="group w-full flex items-center gap-3 rounded-[16px] border border-[var(--color-separator)] bg-[var(--color-bg)] px-3 py-2.5 min-h-[64px] text-left hover:border-[color-mix(in_srgb,var(--color-green)_45%,transparent)] active:scale-[.99] transition">
                <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center bg-[var(--color-green-2)] text-[var(--color-green)]"><UserPlus size={19} aria-hidden /></span>
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold text-[var(--color-label)]">Add staff</span><span className="block text-[12.5px] text-steel leading-snug">Instant sign-in</span></span>
                <ChevronRight size={18} className="shrink-0 text-steel group-hover:translate-x-0.5 transition-transform" aria-hidden />
              </button>}
              <button type="button" onClick={() => { setCode(null); setOpen(true); }} data-way="invite"
                className="group w-full flex items-center gap-3 rounded-[16px] border border-[var(--color-separator)] bg-[var(--color-bg)] px-3 py-2.5 min-h-[64px] text-left hover:border-[color-mix(in_srgb,var(--color-blue)_45%,transparent)] active:scale-[.99] transition">
                <span className="h-11 w-11 shrink-0 rounded-[13px] grid place-items-center bg-[var(--color-blue-2)] text-[var(--color-blue)]"><Ticket size={19} aria-hidden /></span>
                <span className="flex-1 min-w-0"><span className="block text-[15px] font-bold text-[var(--color-label)]">Invite with a code</span><span className="block text-[12.5px] text-steel leading-snug">Join at <b className="text-[var(--color-label)]">/join</b> · 7 days</span></span>
                <ChevronRight size={18} className="shrink-0 text-steel group-hover:translate-x-0.5 transition-transform" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* A person, opened from a grid row (2026-10-22): the same card as the card view (its Call / Sign-in / Access close
          this first), then today, the sections they open, who they report to and who reports to them — each a tap away. */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.full_name ?? ""}>
        {detail && (() => {
          const p = staff.find((x) => x.id === detail.id) ?? detail;   // the list as the server last sent it
          const day = duty.find((x) => x.profile_id === p.id);
          const t = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
          const opens = p.role === "owner" ? null : (p.allowed_modules ?? MODULES_BY_TYPE[type].filter((m) => m !== "dashboard" && ROLE_DEFAULT[p.role].includes(m) && (!enabled || enabled.includes(m) || (ALWAYS_ON as readonly string[]).includes(m))));
          const boss = p.reports_to ? staff.find((x) => x.id === p.reports_to) : null;
          const team = staff.filter((x) => x.reports_to === p.id);
          const box = "rounded-2xl bg-[var(--color-fill)] border border-[var(--color-separator)] p-3.5";
          const who = (x: Staff) => (
            <button key={x.id} type="button" onClick={() => setDetail(x)} className="w-full min-w-0 flex items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-[var(--color-bg-2)]" data-staff-detail-person={x.id}>
              <Avatar name={x.full_name} dept={deptOf(x)} size={34} /><span className="min-w-0 flex-1 leading-tight"><span className="block text-[14px] font-bold truncate">{x.full_name}</span><span className="block text-[12px] text-[var(--color-label-2)] truncate">{titleOf(x)}</span></span>
            </button>);
          return (
            <div className="space-y-3.5" data-staff-detail={p.id}>
              {personCard(p, () => setDetail(null))}
              <div className={cn(box, "flex items-center gap-3")} data-staff-detail-today>
                <span className="h-9 w-9 shrink-0 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, ${day?.in_at && !day.out_at ? "var(--color-green)" : "var(--color-label-3)"} 18%, transparent)`, color: day?.in_at && !day.out_at ? "var(--color-green)" : "var(--color-label-2)" }} aria-hidden><Clock3 size={17} /></span>
                <span className="min-w-0 leading-tight"><span className="block text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)]">Today</span>
                  <span className="block mt-0.5 text-[14px] font-semibold">{day?.in_at ? (day.out_at ? `Worked ${t(day.in_at)} – ${t(day.out_at)}` : `On duty since ${t(day.in_at)}`) : "Not in today"}</span></span>
              </div>
              <div className={box} data-staff-detail-opens>
                <div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)] mb-2">Can open</div>
                {opens === null ? <p className="text-[13.5px] font-semibold">Everything — the owner</p>
                  : opens.length ? <ModuleChips modules={opens} /> : <p className="text-[13.5px] text-[var(--color-label-2)]">Work and checklists only</p>}
              </div>
              {(boss || team.length > 0) && <div className={box} data-staff-detail-team>
                {boss && <><div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)] mb-1">Reports to</div>{who(boss)}</>}
                {team.length > 0 && <><div className={cn("text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)] mb-1", boss && "mt-3")}>Their team · {team.length}</div>{team.map(who)}</>}
              </div>}
            </div>);
        })()}
      </Sheet>
      <Sheet open={!!acc} onClose={() => setAcc(null)} title={acc ? `Access · ${acc.full_name}` : ""} wide>
        {acc && (
          <div className="space-y-5">
            <div><div className="eyebrow mb-2">Position</div>
              <PositionFields type={type} people={staff} self={acc.id} value={accPos} onChange={setAccPos} />
              {accPos.position && (() => {
                const want = suggestedRole(positionByKey(accPos.position), assignable.filter((x) => x !== "owner")) ?? role;
                const opens = posTicks(accPos.position, want);
                const matches = role === want && (opens === null ? ticks === null : sameModules(ticks ?? byDefault(role), opens));
                return (
                  <div className={cn("mt-3 rounded-2xl p-3 border", matches ? "bg-[color-mix(in_srgb,var(--color-green)_9%,transparent)] border-[color-mix(in_srgb,var(--color-green)_28%,transparent)]" : "bg-[color-mix(in_srgb,var(--color-orange)_9%,transparent)] border-[color-mix(in_srgb,var(--color-orange)_28%,transparent)]")} data-position-access={matches ? "match" : "custom"}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] flex-1 min-w-[12rem]">Usual: <b>{ROLE_LABEL[want]}</b>{opens ? "" : " · everything"}</p>
                      {matches ? <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--color-green)]"><Check size={14} aria-hidden /> Matches</span>
                        : acc.id !== me && <button type="button" className="svc-btn go sm !px-4" data-use-position-access onClick={() => { setRole(want); setTicks(opens); }}>Use these</button>}
                    </div>
                    {opens && <ModuleChips modules={opens} className="mt-2" />}
                    {!matches && <p className="text-[12px] text-steel mt-2">Differs from position</p>}
                  </div>);
              })()}</div>
            <Field label="Role" hint={ROLE_HINT[role]}>
              <select value={role} onChange={(e) => { setRole(e.target.value as Role); setTicks(null); }} disabled={acc.id === me}>{assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </Field>
            {myRole !== "owner" && <p className="text-xs text-steel -mt-2">Lower roles, your sections</p>}
            {role === "owner" ? <p className="text-sm text-steel">Full access</p> : (<>
              {controlRoomSwitch(ticks, role, () => toggle("dashboard"))}
              <div className="grid sm:grid-cols-2 gap-x-6">
                {MODULE_GROUPS.map((g) => { const keys = g.keys.filter((k) => ceiling(role).includes(k.key)); if (!keys.length) return null; return (
                  <div key={g.title} className="mb-4 min-w-0"><div className="eyebrow mb-2">{g.title}</div><div className={SWITCH_GROUP}>{keys.map((k) => <SwitchRow key={k.key} title={k.label} hint={k.hint} on={isOn(k.key)} onToggle={() => toggle(k.key)} />)}</div></div>); })}
              </div></>)}
            {(myRole === "owner" || myRole === "manager") && !["owner", "manager", "supervisor"].includes(acc.role) && <div className={SWITCH_GROUP} data-assist-right>
              <SwitchRow title="Assist (AI)" hint="The AI helper button" on={assistOn(acc)} data={{ "data-assist-switch": "" }}
                onToggle={() => { const p = acc, on = !assistOn(p); setAiOn((m) => ({ ...m, [p.id]: on })); start(async () => { const r = await setAssistAccess(p.id, on); if ("error" in r) { setAiOn((m) => ({ ...m, [p.id]: !on })); setErr(r.error!); } }); }} />
            </div>}
            {acc.id !== me && <div className={SWITCH_GROUP}><SwitchRow title="Active" hint="Off = can't sign in" on={active} onToggle={() => setActive(!active)} /></div>}
            {err && <p className="text-sm text-chili">{err}</p>}
            <div className="flex gap-2"><Button className="flex-1" disabled={pending} onClick={() => start(async () => { const r = await setAccess(acc.id, role, role === "owner" ? null : ticks, active); if ("error" in r) { setErr(r.error!); return; } if (!samePos(accPos, posOf(acc))) { const x = await savePos(acc.id, accPos); if ("error" in x) { setErr(x.error!); return; } } setAcc(null); })} data-save-access>Save</Button><Button variant="gray" onClick={() => setAcc(null)}>Cancel</Button></div>
            {/* the owner gives a manager or a supervisor the two owner's screens (0140): saved at once, like Assist */}
            {myRole === "owner" && ["manager", "supervisor", "supervisor_2"].includes(acc.role) && <div className={SWITCH_GROUP} data-grants>
              <SwitchRow title="Connections" hint="Swiggy, Zomato, payments" icon={<Plug size={18} />} on={grantsOf(acc).includes("connections")} data={{ "data-grant-switch": "connections" }} onToggle={() => flipGrant(acc, "connections")} />
              <SwitchRow title="Reports" hint="Money in and out" icon={<BarChart3 size={18} />} on={grantsOf(acc).includes("reports")} data={{ "data-grant-switch": "reports" }} onToggle={() => flipGrant(acc, "reports")} />
            </div>}
            {myRole === "owner" && acc.role === "manager" && <div className={SWITCH_GROUP} data-password-right>
              <SwitchRow title="Temporary passwords" hint="Add staff, reset passwords" icon={<KeyRound size={18} />} on={issueOn(acc)} data={{ "data-password-right-switch": "" }}
                onToggle={() => { const p = acc, on = !issueOn(p); setIssue((m) => ({ ...m, [p.id]: on })); start(async () => { const r = await setPasswordRight(p.id, on); if ("error" in r) { setIssue((m) => ({ ...m, [p.id]: !on })); setErr(r.error!); } else toast(on ? `${p.full_name} can now give temporary passwords` : "Only you give temporary passwords now"); }); }} />
            </div>}
            {canIssue && acc.id !== me && <div className="pt-1 border-t border-line">
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => { const p = acc; setAcc(null); resetPw(p); }}><KeyRound size={14} /> Reset their password</Button>
              <p className="text-xs text-steel mt-1">One-time password</p>
            </div>}
          </div>
        )}
      </Sheet>
      {/* add someone outright, and hand them the slip */}
      <Sheet open={add} onClose={() => { setAdd(false); setMade(null); }} title={made ? "Sign-in details" : "Add staff"} wide>
        {made ? (
          <div className="space-y-4">
            <Credentials title={made.title} loginId={made.login_id} password={made.temp_password} staffCode={made.staff_code} canIssue={canIssue} />
            {made.verify && (otpDone ? (
              <div className="feather p-4 flex items-center gap-2 text-sm"><Check size={16} className="text-mint" /> <span><b>{made.verify.email}</b> confirmed</span></div>
            ) : (
              <div className="feather p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-steel">Confirm their email</div>
                {made.verify.mailed
                  ? <p className="text-sm text-steel">6-digit code sent to <b>{made.verify.email}</b>{made.verify.echoed && <> <span className="num">(dev: {made.verify.echoed})</span></>}</p>
                  : <p className="text-sm text-chili">The code could not be sent: {made.verify.mailError} Confirm it later from the staff list.</p>}
                <div className="flex gap-2">
                  <input className="num flex-1 tracking-[0.3em]" inputMode="numeric" maxLength={6} value={otp} placeholder="000000"
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} />
                  <Button disabled={pending || otp.length < 6} onClick={() => start(async () => {
                    setOtpErr(null);
                    const r = await verifyStaffContact(made.verify!.userId, otp);
                    if ("error" in r) { setOtpErr(r.error!); return; }
                    setOtpDone(true);
                  })}>Confirm</Button>
                </div>
                <button type="button" className="text-xs text-steel underline" disabled={pending} onClick={() => start(async () => {
                  setOtpErr(null);
                  const r = await sendStaffVerification(made.verify!.userId);
                  if ("error" in r) setOtpErr(r.error!); else setOtpErr("New code sent");
                })}>Send a new code</button>
                {otpErr && <p className="text-sm text-chili">{otpErr}</p>}
              </div>
            ))}
            <Button className="w-full" onClick={() => { setAdd(false); setMade(null); }}><Check size={16} /> Done</Button>
          </div>
        ) : (
          <form className="space-y-5" action={(fd) => start(async () => {
            setAddErr(null);
            const r = await addStaff({
              full_name: String(fd.get("full_name") ?? ""), role: addRole,
              modules: addRole === "owner" ? null : addTicks,
              login_id: String(fd.get("login_id") ?? ""), contact_email: String(fd.get("contact_email") ?? ""), phone: String(fd.get("phone") ?? ""),
            });
            if ("error" in r) { setAddErr(r.error!); return; }
            // their position goes on once the person exists; a failure here leaves the sign-in made and says so
            if (addPos.department || addPos.position || addPos.title || addPos.reportsTo || addPos.joinedOn) { const x = await savePos(r.user_id, addPos); if ("error" in x) setAddErr(`Added — but the position was not saved: ${x.error}`); }
            // the emergency contact goes on the same way (0134); a failure leaves the sign-in made and says so
            const eName = String(fd.get("emergency_name") ?? "").trim(), ePhone = String(fd.get("emergency_phone") ?? "").trim();
            if (eName || ePhone) { const x = await setEmergency(r.user_id, eName, ePhone); if ("error" in x) setAddErr(`Added — but the emergency contact was not saved: ${x.error}`); }
            setOtp(""); setOtpDone(false); setOtpErr(null);
            setMade({ title: `${r.full_name} · ${ROLE_LABEL[r.role as Role]}`, staff_code: r.staff_code, login_id: r.login_id, temp_password: r.temp_password,
                      verify: { userId: r.user_id, email: r.contact_email, mailed: r.mailed, mailError: r.mailError, echoed: r.echoed } });
          })}>
            <Field label="Full name"><input name="full_name" required autoFocus placeholder="Ravi Kumar" /></Field>
            <div><div className="eyebrow mb-2">Position</div>
              <PositionFields type={type} people={staff} value={addPos} onChange={pickAddPos} />
              {addPos.position && <div className="mt-3 rounded-2xl bg-[color-mix(in_srgb,var(--color-tint)_9%,transparent)] border border-[color-mix(in_srgb,var(--color-tint)_25%,transparent)] p-3" data-position-preset>
                <p className="text-[13px]">Suggested: <b>{ROLE_LABEL[addRole]}</b>{posTicks(addPos.position, addRole) ? "" : " · everything"}</p>
                {posTicks(addPos.position, addRole) && <ModuleChips modules={posTicks(addPos.position, addRole)!} className="mt-2" />}
                <p className="text-[12px] text-steel mt-2">Ticked below. Change any.</p>
              </div>}</div>
            <Field label="Role" hint={ROLE_HINT[addRole]}>
              <select value={addRole} onChange={(e) => { setAddRole(e.target.value as Role); setAddTicks(null); }}>{assignable.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </Field>
            <Field label="Their email" hint="For reset codes">
              <input name="contact_email" type="email" required placeholder="ravi@example.com" />
            </Field>
            <Field label="Phone" hint="10 digits.">
              <input name="phone" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" placeholder="9876543210"
                onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 10); }} />
            </Field>
            {/* who to call if something happens to them (2026-10-23, 0134) — on file from the first day; they can change it on My profile */}
            <div className="grid gap-3 sm:grid-cols-2" data-add-emergency>
              <Field label="Emergency contact" hint="Name and relation. Optional.">
                <input name="emergency_name" maxLength={60} placeholder="Lakshmi · mother" />
              </Field>
              <Field label="Emergency number" hint="Optional.">
                <input name="emergency_phone" type="tel" inputMode="tel" maxLength={20} placeholder="98400 67890" className="num"
                  onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/[^0-9 +()-]/g, ""); }} />
              </Field>
            </div>
            <Field label="Login ID" hint="Blank = from name">
              <div className="flex items-center gap-2"><input name="login_id" className="flex-1" placeholder="Optional" /><span className="text-sm text-steel shrink-0">@{loginDomain}</span></div>
            </Field>
            <div>
              <div className="eyebrow mb-2">Sections they can open</div>
              {controlRoomSwitch(addTicks, addRole, () => addToggle("dashboard"))}
              <div className="grid sm:grid-cols-2 gap-x-6">
                {MODULE_GROUPS.map((g) => { const keys = g.keys.filter((k) => ceiling(addRole).includes(k.key)); if (!keys.length) return null; return (
                  <div key={g.title} className="mb-4 min-w-0"><div className="eyebrow mb-2">{g.title}</div><div className={SWITCH_GROUP}>{keys.map((k) => <SwitchRow key={k.key} title={k.label} hint={k.hint} on={addOn(k.key)} onToggle={() => addToggle(k.key)} />)}</div></div>); })}
              </div>
            </div>
            {addErr && <p className="text-sm text-chili">{addErr}</p>}
            <Button className="w-full" disabled={pending}>Add staff</Button>
          </form>
        )}
      </Sheet>

      <Sheet open={!!selfEdit} onClose={() => setSelfEdit(null)} title="Your position">
        {selfEdit && <div className="space-y-4" data-own-position-sheet>
          <PositionFields type={type} people={staff} self={selfEdit.id} value={selfPos} onChange={setSelfPos} />
          {selfErr && <p className="text-sm text-chili">{selfErr}</p>}
          <Button className="w-full" disabled={pending} onClick={() => start(async () => { const x = await savePos(selfEdit.id, selfPos); if ("error" in x) setSelfErr(x.error!); else setSelfEdit(null); })} data-save-own-position><Check size={16} /> Save</Button>
        </div>}
      </Sheet>
      <Sheet open={open} onClose={() => setOpen(false)} title="Invite with a code">
        {!code ? (
          <form className="space-y-4" action={(fd) => start(async () => { const r = await createInvite(String(fd.get("role"))); if ("code" in r) setCode(r.code!); })}>
            <Field label="Role" hint="Sets their first sections"><select name="role" defaultValue={assignable[assignable.length - 1]}>{assignable.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Button className="w-full" disabled={pending}>Generate code</Button>
          </form>
        ) : (
          <div className="text-center space-y-4"><p className="text-sm text-steel">One use · 7 days</p>
            <div className="num text-4xl tracking-[0.3em] font-semibold">{code}</div>
            <Button variant="outline" onClick={() => copyText(code)}><Copy size={16} /> Copy</Button></div>
        )}
      </Sheet>
    </div>
  );
}

type Chip = { key: string | null; label: string; n: number };
/**
 * The department chips from md up — iPad and desktop (2026-10-22, the owner: "ultra modern, compact"). They wrapped into
 * two or three rows of bordered pills; now they are one row in a soft track, like the People · Team chart · Positions
 * switch above: the chosen one raised on the card colour, the rest plain words with their department's icon and a quiet
 * count. A row longer than the room slides — faded at the edge it continues past, with a round arrow there (only then) —
 * and choosing a chip brings it into view. 36px with a mouse, 44px on a touch screen. The phone keeps its own row.
 */
function DeptRail({ chips, value, onPick }: { chips: Chip[]; value: string | null; onPick: (k: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const f = () => setEdge({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    f(); el.addEventListener("scroll", f, { passive: true }); const ro = new ResizeObserver(f); ro.observe(el);
    return () => { el.removeEventListener("scroll", f); ro.disconnect(); };
  }, [chips.length]);
  useEffect(() => {   // the chosen chip in view
    const el = ref.current, b = el?.querySelector<HTMLElement>('[aria-pressed="true"]'); if (!el || !b) return;
    const l = b.offsetLeft - 44, r = b.offsetLeft + b.offsetWidth + 44;
    if (l < el.scrollLeft) el.scrollTo({ left: Math.max(0, l), behavior: "smooth" });
    else if (r > el.scrollLeft + el.clientWidth) el.scrollTo({ left: r - el.clientWidth, behavior: "smooth" });
  }, [value]);
  const by = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * el.clientWidth * 0.7, behavior: "smooth" }); };
  const mask = edge.l && edge.r ? "linear-gradient(90deg, transparent, #000 36px, #000 calc(100% - 36px), transparent)"
    : edge.l ? "linear-gradient(90deg, transparent, #000 36px)" : edge.r ? "linear-gradient(90deg, #000 calc(100% - 36px), transparent)" : "none";
  const arrow = "shrink-0 h-9 w-9 !min-h-9 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:!min-h-11 rounded-full grid place-items-center bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_4px_rgb(0_0_0/0.22)] hover:brightness-110";
  return (
    <div className="hidden md:flex items-center gap-1 min-w-0 rounded-full bg-[var(--color-fill)] p-1" data-dept-rail>
      {edge.l && <button type="button" onClick={() => by(-1)} className={arrow} aria-label="Earlier departments" data-dept-prev><ChevronLeft size={17} aria-hidden /></button>}
      <div ref={ref} className="flex-1 min-w-0 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maskImage: mask, WebkitMaskImage: mask }} role="group" aria-label="Department" data-dept-chips="rail">
        {chips.map((d) => {
          const on = value === d.key, hue = d.key && d.key !== "none" ? deptHue(d.key) : null;
          return (
            <button key={d.key ?? "all"} type="button" aria-pressed={on} onClick={() => onPick(d.key)}
              className={cn("shrink-0 h-9 !min-h-9 pointer-coarse:h-11 pointer-coarse:!min-h-11 rounded-full pl-1.5 pr-3 inline-flex items-center gap-2 text-[13px] font-bold whitespace-nowrap transition-[background-color,color,box-shadow] duration-150",
                on ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_4px_rgb(0_0_0/0.22)]" : "text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[color-mix(in_srgb,var(--color-bg-2)_55%,transparent)]")}>
              <span className="h-6 w-6 shrink-0 rounded-full grid place-items-center" style={hue ? { background: `color-mix(in srgb, ${hue} 20%, transparent)`, color: hue } : { background: "var(--color-bg-2)", color: "var(--color-label-2)" }} aria-hidden>
                {d.key === null ? <Users size={13} /> : <DeptIcon dept={d.key === "none" ? null : d.key} size={13} />}</span>
              {d.label}<b className={cn("num text-[11.5px] font-bold", on ? "text-[var(--color-label-2)]" : "text-[var(--color-label-3)]")}>{d.n}</b>
            </button>);
        })}
      </div>
      {edge.r && <button type="button" onClick={() => by(1)} className={arrow} aria-label="More departments" data-dept-next><ChevronRight size={17} aria-hidden /></button>}
    </div>
  );
}
