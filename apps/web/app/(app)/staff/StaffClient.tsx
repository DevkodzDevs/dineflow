"use client";
import { useState, useTransition } from "react";
import { Copy, UserPlus, KeyRound, Check } from "lucide-react";
import { SlidersHorizontal as AccessIcon } from "lucide-react";
import { Button, Card, Field, Sheet, Pill, cn, useToast } from "@/components/ui";
import { ROLE_LABEL, ROLE_HINT, ROLE_ACCESS, MODULE_GROUPS, MODULES_BY_TYPE, ALWAYS_ON, rolesIMayAssign, canManage, type Role, type PropertyType } from "@dineflow/shared";
import { createInvite, setAccess, addStaff, staffLogin, resetStaffPassword, sendStaffVerification, verifyStaffContact } from "./actions";

/** The slip you hand over: a login ID and a temporary password, which they must change on first use. */
function Credentials({ title, loginId, password, staffCode, note }: { title: string; loginId: string; password: string | null; staffCode?: string | null; note?: string }) {
  const toast = useToast();
  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); toast(`${what} copied`); };
  return (
    <div className="space-y-3">
      <div className="feather p-4 space-y-3">
        <div className="flex items-center gap-2"><div className="text-xs font-semibold uppercase tracking-wide text-steel flex-1">{title}</div>{staffCode && <span className="pill pill-gold num">{staffCode}</span>}</div>
        <div><div className="text-[11px] uppercase tracking-wide text-steel">Login ID</div>
          <div className="flex items-center gap-2"><span className="num font-semibold break-all flex-1">{loginId}</span>
            <Button size="sm" variant="ghost" onClick={() => copy(loginId, "Login ID")} aria-label="Copy login ID"><Copy size={14} /></Button></div></div>
        {password
          ? <div><div className="text-[11px] uppercase tracking-wide text-steel">Temporary password</div>
              <div className="flex items-center gap-2"><span className="num font-semibold flex-1">{password}</span>
                <Button size="sm" variant="ghost" onClick={() => copy(password, "Password")} aria-label="Copy password"><Copy size={14} /></Button></div></div>
          : <div className="text-sm text-steel">They have already set their own password, so there is nothing left to show. Reset it if they are locked out.</div>}
      </div>
      <p className="text-xs text-steel">{note ?? "Write it down or copy it now — it is readable for three days, and disappears the moment they choose their own password. They will be asked to change it the first time they sign in."}</p>
    </div>
  );
}

type Staff = { id: string; full_name: string; email: string | null; phone: string | null; contact_email: string | null; contact_verified_at: string | null; staff_code: string | null; role: Role; is_active: boolean; allowed_modules: string[] | null; must_change_password: boolean };
type Invite = { code: string; role: Role; expires_at: string };

export function StaffClient({ me, myRole, myModules, type, enabled, staff, invites, loginDomain }: { me: string; myRole: Role; myModules: string[]; type: PropertyType; enabled: string[] | null; staff: Staff[]; invites: Invite[]; loginDomain: string }) {
  // the ranks below mine — the only ones I may appoint anyone to
  const assignable = rolesIMayAssign(myRole);
  const [acc, setAcc] = useState<Staff | null>(null); const [role, setRole] = useState<Role>(assignable[assignable.length - 1] ?? "employee"); const [ticks, setTicks] = useState<string[] | null>(null); const [active, setActive] = useState(true); const [err, setErr] = useState<string | null>(null);
  const openAccess = (p: Staff) => { setAcc(p); setRole(p.role); setTicks(p.allowed_modules); setActive(p.is_active); setErr(null); };
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
  const isOn = (k: string) => ticks === null ? true : ticks.includes(k);
  const toggle = (k: string) => { const base = ticks === null ? ceiling(role).filter((x) => x !== "dashboard") : ticks; setTicks(base.includes(k) ? base.filter((x) => x !== k) : [...base, k]); };
  const [open, setOpen] = useState(false); const [code, setCode] = useState<string | null>(null); const [pending, start] = useTransition();
  // adding someone outright, and the slip that comes back
  const [add, setAdd] = useState(false);
  const [addRole, setAddRole] = useState<Role>(assignable[assignable.length - 1] ?? "employee");
  const [addTicks, setAddTicks] = useState<string[] | null>(null);
  const [made, setMade] = useState<{ title: string; staff_code?: string | null; login_id: string; temp_password: string | null; verify?: { userId: string; email: string; mailed: boolean; mailError?: string | null; echoed?: string } } | null>(null);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [otp, setOtp] = useState(""); const [otpDone, setOtpDone] = useState(false); const [otpErr, setOtpErr] = useState<string | null>(null);
  const addOn = (k: string) => addTicks === null ? true : addTicks.includes(k);
  const addToggle = (k: string) => { const base = addTicks === null ? ceiling(addRole).filter((x) => x !== "dashboard") : addTicks; setAddTicks(base.includes(k) ? base.filter((x) => x !== k) : [...base, k]); };
  const openAdd = () => { setAdd(true); setMade(null); setAddErr(null); setAddRole(assignable[assignable.length - 1] ?? "employee"); setAddTicks(null); };
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
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="feather divide-y divide-line">
        {staff.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className="h-10 w-10 rounded-full bg-ink text-on-label grid place-items-center font-display">{p.full_name.slice(0, 1)}</span>
            <div className="flex-1 min-w-0">
              <div className={cn("font-semibold truncate", !p.is_active && "text-steel line-through")}>{p.full_name}{p.id === me && <span className="text-xs text-steel font-normal"> (you)</span>}</div>
              <div className="text-xs text-steel truncate">{p.staff_code && <span className="num font-semibold text-[var(--color-label-2)]">{p.staff_code}</span>}{p.staff_code && " · "}{p.email}{p.phone && <> · {p.phone}</>}</div>
            </div>
            {/* still on the slip they were handed — they have not chosen their own password yet */}
            {p.must_change_password && <span className="pill" title="Has not signed in and set their own password yet">Not signed in</span>}
            {p.contact_email && !p.contact_verified_at && <span className="pill" title="Their email is unconfirmed, so they cannot reset their own password yet">Email unconfirmed</span>}
            <span className="pill pill-gold">{ROLE_LABEL[p.role]}</span>
            {p.role !== "owner" && <span className="text-xs text-steel hidden sm:inline">{p.allowed_modules ? `${p.allowed_modules.length} sections` : "role default"}</span>}
            {p.id !== me && canManage(myRole, p.role) && <>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => showLogin(p)} title="Sign-in details"><KeyRound size={14} /></Button>
              <Button size="sm" variant="outline" onClick={() => openAccess(p)}><AccessIcon size={14} /> Access</Button>
            </>}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Button className="w-full" onClick={openAdd}><UserPlus size={16} /> Add staff</Button>
        <Button className="w-full" variant="outline" onClick={() => { setCode(null); setOpen(true); }}>Invite with a code</Button>
        <p className="text-xs text-steel">Add staff when you want to hand someone their sign-in yourself. Invite with a code when they have their own email and can sign themselves up.</p>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Open invites</div>
          {invites.length === 0 && <p className="text-sm text-steel">None. Invite codes last 7 days.</p>}
          <ul className="space-y-2">{invites.map((i) => <li key={i.code} className="flex items-center justify-between text-sm"><span className="num font-semibold tracking-wider">{i.code}</span><Pill tone="pending">{ROLE_LABEL[i.role]}</Pill></li>)}</ul></Card>
        <p className="text-xs text-steel">Staff open <b>/join</b> in the web app or the mobile app, enter the code and their details, and land straight in their screens.</p>
      </div>
      <Sheet open={!!acc} onClose={() => setAcc(null)} title={acc ? `Access · ${acc.full_name}` : ""} wide>
        {acc && (
          <div className="space-y-5">
            <Field label="Role" hint={ROLE_HINT[role]}>
              <select value={role} onChange={(e) => { setRole(e.target.value as Role); setTicks(null); }} disabled={acc.id === me}>{assignable.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </Field>
            {myRole !== "owner" && <p className="text-xs text-steel -mt-2">You can only give someone a level below your own, and only the sections you hold yourself.</p>}
            {role === "owner" ? <p className="text-sm text-steel">An owner has everything the master allowed this property. Nothing to tick.</p> : (
              <div className="grid sm:grid-cols-2 gap-x-6">
                {MODULE_GROUPS.map((g) => { const keys = g.keys.filter((k) => ceiling(role).includes(k.key)); if (!keys.length) return null; return (
                  <div key={g.title} className="mb-4"><div className="eyebrow mb-2">{g.title}</div><div className="group">{keys.map((k) => <label key={k.key} className="row cursor-pointer"><div className="flex-1"><div className="text-[15px]">{k.label}</div><div className="text-[13px] text-steel">{k.hint}</div></div><span className="switch" data-on={isOn(k.key) ? "true" : "false"} onClick={() => toggle(k.key)} /></label>)}</div></div>); })}
              </div>)}
            {acc.id !== me && <div className="group"><label className="row cursor-pointer"><div className="flex-1"><div className="text-[15px]">Active</div><div className="text-[13px] text-steel">Off means they can't sign in until you turn it back on.</div></div><span className="switch" data-on={active ? "true" : "false"} onClick={() => setActive(!active)} /></label></div>}
            {err && <p className="text-sm text-chili">{err}</p>}
            <div className="flex gap-2"><Button className="flex-1" disabled={pending} onClick={() => start(async () => { const r = await setAccess(acc.id, role, role === "owner" ? null : ticks, active); if ("error" in r) setErr(r.error!); else setAcc(null); })}>Save</Button><Button variant="gray" onClick={() => setAcc(null)}>Cancel</Button></div>
            <div className="pt-1 border-t border-line">
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => { const p = acc; setAcc(null); resetPw(p); }}><KeyRound size={14} /> Reset their password</Button>
              <p className="text-xs text-steel mt-1">Gives them a new temporary password to sign in with once, then set their own. Use it when someone is locked out.</p>
            </div>
          </div>
        )}
      </Sheet>
      {/* add someone outright, and hand them the slip */}
      <Sheet open={add} onClose={() => { setAdd(false); setMade(null); }} title={made ? "Sign-in details" : "Add staff"} wide>
        {made ? (
          <div className="space-y-4">
            <Credentials title={made.title} loginId={made.login_id} password={made.temp_password} staffCode={made.staff_code} />
            {made.verify && (otpDone ? (
              <div className="feather p-4 flex items-center gap-2 text-sm"><Check size={16} className="text-mint" /> <span><b>{made.verify.email}</b> confirmed. They can reset their own password from now on.</span></div>
            ) : (
              <div className="feather p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-steel">Confirm their email</div>
                {made.verify.mailed
                  ? <p className="text-sm text-steel">A 6-digit code went to <b>{made.verify.email}</b>. Enter it here while they have their phone out — until it is confirmed, a lost password cannot be reset by them.{made.verify.echoed && <> <span className="num">(dev: {made.verify.echoed})</span></>}</p>
                  : <p className="text-sm text-chili">The code could not be sent: {made.verify.mailError} You can confirm the address later from the staff list.</p>}
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
                  if ("error" in r) setOtpErr(r.error!); else setOtpErr("A new code has been sent.");
                })}>Send a new code</button>
                {otpErr && <p className="text-sm text-chili">{otpErr}</p>}
              </div>
            ))}
            <div className="group"><div className="row"><div className="flex-1"><div className="text-[15px]">What happens next</div>
              <div className="text-[13px] text-steel">They open the app, sign in with this ID and password, and are asked to set their own straight away. The temporary one stops working after three days. Their sections are already set — change them any time with Access.</div></div></div></div>
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
            setOtp(""); setOtpDone(false); setOtpErr(null);
            setMade({ title: `${r.full_name} · ${ROLE_LABEL[r.role as Role]}`, staff_code: r.staff_code, login_id: r.login_id, temp_password: r.temp_password,
                      verify: { userId: r.user_id, email: r.contact_email, mailed: r.mailed, mailError: r.mailError, echoed: r.echoed } });
          })}>
            <Field label="Full name"><input name="full_name" required autoFocus placeholder="Ravi Kumar" /></Field>
            <Field label="Role" hint={ROLE_HINT[addRole]}>
              <select value={addRole} onChange={(e) => { setAddRole(e.target.value as Role); setAddTicks(null); }}>{assignable.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </Field>
            <Field label="Their email" hint="Required — password reset codes go here, and nothing is ever delivered to the login ID.">
              <input name="contact_email" type="email" required placeholder="ravi@example.com" />
            </Field>
            <Field label="Phone" hint="10 digits.">
              <input name="phone" inputMode="numeric" maxLength={10} pattern="[0-9]{10}" placeholder="9876543210"
                onInput={(e) => { const t = e.currentTarget; t.value = t.value.replace(/\D/g, "").slice(0, 10); }} />
            </Field>
            <Field label="Login ID" hint={`Leave blank and one is made from their name. The @${loginDomain} part is added for you — it is what they type to sign in, not a mailbox.`}>
              <div className="flex items-center gap-2"><input name="login_id" className="flex-1" placeholder="made from their name" /><span className="text-sm text-steel shrink-0">@{loginDomain}</span></div>
            </Field>
            <div>
              <div className="eyebrow mb-2">Sections they can open</div>
              <div className="grid sm:grid-cols-2 gap-x-6">
                {MODULE_GROUPS.map((g) => { const keys = g.keys.filter((k) => ceiling(addRole).includes(k.key)); if (!keys.length) return null; return (
                  <div key={g.title} className="mb-4"><div className="text-[11px] uppercase tracking-wide text-steel mb-1">{g.title}</div><div className="group">{keys.map((k) => <label key={k.key} className="row cursor-pointer"><div className="flex-1"><div className="text-[15px]">{k.label}</div><div className="text-[13px] text-steel">{k.hint}</div></div><span className="switch" data-on={addOn(k.key) ? "true" : "false"} onClick={() => addToggle(k.key)} /></label>)}</div></div>); })}
              </div>
            </div>
            {addErr && <p className="text-sm text-chili">{addErr}</p>}
            <Button className="w-full" disabled={pending}>Add and make their sign-in</Button>
          </form>
        )}
      </Sheet>

      <Sheet open={open} onClose={() => setOpen(false)} title="Invite with a code">
        {!code ? (
          <form className="space-y-4" action={(fd) => start(async () => { const r = await createInvite(String(fd.get("role"))); if ("code" in r) setCode(r.code!); })}>
            <Field label="Role" hint="They land in the sections this role starts with; set them exactly once they've joined."><select name="role" defaultValue={assignable[assignable.length - 1]}>{assignable.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
            <Button className="w-full" disabled={pending}>Generate code</Button>
          </form>
        ) : (
          <div className="text-center space-y-4"><p className="text-sm text-steel">Share this code. It works once and expires in 7 days.</p>
            <div className="num text-4xl tracking-[0.3em] font-semibold">{code}</div>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(code)}><Copy size={16} /> Copy</Button></div>
        )}
      </Sheet>
    </div>
  );
}
