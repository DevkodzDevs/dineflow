"use client";
import { useState, useTransition } from "react";
import { Copy, UserPlus } from "lucide-react";
import { SlidersHorizontal as AccessIcon } from "lucide-react";
import { Button, Card, Field, Sheet, Pill, cn } from "@/components/ui";
import { ROLES, ROLE_LABEL, MODULE_GROUPS, modulesFor, type Role, type PropertyType } from "@dineflow/shared";
import { createInvite, setAccess } from "./actions";

type Staff = { id: string; full_name: string; email: string | null; role: Role; is_active: boolean; allowed_modules: string[] | null };
type Invite = { code: string; role: Role; expires_at: string };

export function StaffClient({ me, myRole, type, enabled, staff, invites }: { me: string; myRole: Role; type: PropertyType; enabled: string[] | null; staff: Staff[]; invites: Invite[] }) {
  const [acc, setAcc] = useState<Staff | null>(null); const [role, setRole] = useState<Role>("waiter"); const [ticks, setTicks] = useState<string[] | null>(null); const [active, setActive] = useState(true); const [err, setErr] = useState<string | null>(null);
  const openAccess = (p: Staff) => { setAcc(p); setRole(p.role); setTicks(p.allowed_modules); setActive(p.is_active); setErr(null); };
  // what this person could ever open here: the property type ∩ their role ∩ the master's set
  const ceiling = (r: Role) => modulesFor(type, r, enabled);
  const isOn = (k: string) => ticks === null ? true : ticks.includes(k);
  const toggle = (k: string) => { const base = ticks === null ? ceiling(role).filter((x) => x !== "dashboard") : ticks; setTicks(base.includes(k) ? base.filter((x) => x !== k) : [...base, k]); };
  const [open, setOpen] = useState(false); const [code, setCode] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="feather divide-y divide-line">
        {staff.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <span className="h-10 w-10 rounded-full bg-ink text-white grid place-items-center font-display">{p.full_name.slice(0, 1)}</span>
            <div className="flex-1 min-w-0"><div className={cn("font-semibold truncate", !p.is_active && "text-steel line-through")}>{p.full_name}{p.id === me && <span className="text-xs text-steel font-normal"> (you)</span>}</div><div className="text-xs text-steel truncate">{p.email}</div></div>
            <span className="pill pill-gold">{ROLE_LABEL[p.role]}</span>
            {p.role !== "owner" && <span className="text-xs text-steel hidden sm:inline">{p.allowed_modules ? `${p.allowed_modules.length} sections` : "role default"}</span>}
            {p.id !== me && (myRole === "owner" || p.role !== "owner") && <Button size="sm" variant="outline" onClick={() => openAccess(p)}><AccessIcon size={14} /> Access</Button>}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <Button className="w-full" onClick={() => { setCode(null); setOpen(true); }}><UserPlus size={16} /> Invite staff</Button>
        <Card><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Open invites</div>
          {invites.length === 0 && <p className="text-sm text-steel">None. Invite codes last 7 days.</p>}
          <ul className="space-y-2">{invites.map((i) => <li key={i.code} className="flex items-center justify-between text-sm"><span className="num font-semibold tracking-wider">{i.code}</span><Pill tone="pending">{ROLE_LABEL[i.role]}</Pill></li>)}</ul></Card>
        <p className="text-xs text-steel">Staff open <b>/join</b> in the web app or the mobile app, enter the code and their details, and land straight in their screens.</p>
      </div>
      <Sheet open={!!acc} onClose={() => setAcc(null)} title={acc ? `Access · ${acc.full_name}` : ""} wide>
        {acc && (
          <div className="space-y-5">
            <Field label="Role" hint="The role sets a sensible default. Untick anything this person shouldn't see.">
              <select value={role} onChange={(e) => { setRole(e.target.value as Role); setTicks(null); }} disabled={acc.id === me}>{ROLES.filter((r) => myRole === "owner" || r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
            </Field>
            {role === "owner" ? <p className="text-sm text-steel">An owner has everything the master allowed this property. Nothing to tick.</p> : (
              <div className="grid sm:grid-cols-2 gap-x-6">
                {MODULE_GROUPS.map((g) => { const keys = g.keys.filter((k) => ceiling(role).includes(k.key)); if (!keys.length) return null; return (
                  <div key={g.title} className="mb-4"><div className="eyebrow mb-2">{g.title}</div><div className="group">{keys.map((k) => <label key={k.key} className="row cursor-pointer"><div className="flex-1"><div className="text-[15px]">{k.label}</div><div className="text-[13px] text-steel">{k.hint}</div></div><span className="switch" data-on={isOn(k.key) ? "true" : "false"} onClick={() => toggle(k.key)} /></label>)}</div></div>); })}
              </div>)}
            {acc.id !== me && <div className="group"><label className="row cursor-pointer"><div className="flex-1"><div className="text-[15px]">Active</div><div className="text-[13px] text-steel">Off means they can't sign in until you turn it back on.</div></div><span className="switch" data-on={active ? "true" : "false"} onClick={() => setActive(!active)} /></label></div>}
            {err && <p className="text-sm text-chili">{err}</p>}
            <div className="flex gap-2"><Button className="flex-1" disabled={pending} onClick={() => start(async () => { const r = await setAccess(acc.id, role, role === "owner" ? null : ticks, active); if ("error" in r) setErr(r.error!); else setAcc(null); })}>Save</Button><Button variant="gray" onClick={() => setAcc(null)}>Cancel</Button></div>
          </div>
        )}
      </Sheet>
      <Sheet open={open} onClose={() => setOpen(false)} title="Invite staff">
        {!code ? (
          <form className="space-y-4" action={(fd) => start(async () => { const r = await createInvite(String(fd.get("role"))); if ("code" in r) setCode(r.code!); })}>
            <Field label="Role"><select name="role" defaultValue="waiter">{ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
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
