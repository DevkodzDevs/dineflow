"use client";
import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Clock, AlertTriangle, ShieldCheck, Pencil, X, User, Building2, FileText, BarChart3, Save } from "lucide-react";
import { Button, Pill, cn } from "@/components/ui";
import type { PropertyDetail } from "./actions";
import { resetPropertyPassword, setContactEmail, updateProperty } from "./actions";

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—"
  : typeof v === "boolean" ? (v ? "Yes" : "No")
  : String(v).length === 24 && /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 16).replace("T", " ")
  : String(v);
const fmt = (n: number) => n.toLocaleString("en-IN");

function asText(d: PropertyDetail) {
  const block = (title: string, rows: [string, unknown][]) =>
    [title, ...rows.map(([k, v]) => `  ${label(k)}: ${show(v)}`)].join("\n");
  return [
    block("PROPERTY", Object.entries(d.property)),
    block("TAX & GST", Object.entries(d.tax)),
    ["USERS", ...d.users.map((u) => [
      `  ${u.name} (${u.role})`,
      `    Login id      : ${u.login_id}`,
      `    Contact email : ${u.contact_email ?? "—"}`,
      `    Password      : ${u.must_change_password
        ? u.temp_password ? `TEMPORARY: ${u.temp_password}  (expires ${show(u.temp_password_expires)})` : "temporary, expired"
        : "set by the owner"}`,
      `    Active        : ${u.is_active ? "yes" : "no"}`,
      `    Last sign-in  : ${show(u.last_sign_in_at)}`,
    ].join("\n"))].join("\n"),
    block("CONTENTS", Object.entries(d.contents)),
  ].join("\n\n");
}

function CopyBtn({ text, label: l = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className={cn("inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors",
      done ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)]", className)}
      onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }}>
      {done ? <><Check size={12} /> Copied</> : <><Copy size={12} /> {l}</>}
    </button>
  );
}

function SectionHead({ icon, title, actions }: { icon: React.ReactNode; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-1 mb-3">
      <span className="h-7 w-7 rounded-lg bg-[var(--color-fill)] grid place-items-center text-steel shrink-0">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-steel flex-1">{title}</span>
      {actions}
    </div>
  );
}

function InfoRow({ label: l, value, mono, warn, children }: { label: string; value?: string; mono?: boolean; warn?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[var(--color-separator)]/50 last:border-0">
      <span className="text-xs text-steel w-28 shrink-0 pt-0.5">{l}</span>
      <span className={cn("text-sm flex-1 min-w-0 break-all", mono && "num", warn && "text-[var(--color-orange)]")}>
        {children ?? value ?? "—"}
      </span>
    </div>
  );
}

function daysLeft(iso: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

/* ── user card with inline-editable contact email ─────────────────────────── */
function UserCard({ u, restaurantId, onRefresh }: {
  u: PropertyDetail["users"][number]; restaurantId: string; onRefresh?: () => void }) {
  const [pending, start] = useTransition();
  const [newPw, setNewPw] = useState<{ email: string; password: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editContact, setEditContact] = useState(false);
  const [contactDraft, setContactDraft] = useState(u.contact_email ?? "");

  const hasTemp = !!u.temp_password;
  const expired = u.temp_password_expired;
  const lockedOut = u.temp_password_locked_out;
  const dLeft = daysLeft(u.temp_password_expires);
  const dToLockout = daysLeft(u.temp_password_lockout);
  const changed = !u.must_change_password && !hasTemp;

  const generate = () => start(async () => {
    setErr(null);
    const r = await resetPropertyPassword(restaurantId);
    if ("error" in r) { setErr(r.error!); return; }
    setNewPw({ email: r.login_email, password: r.temp_password });
    onRefresh?.();
  });

  const saveContact = () => start(async () => {
    setErr(null);
    const r = await setContactEmail(restaurantId, contactDraft);
    if ("error" in r) { setErr(r.error!); return; }
    setEditContact(false);
    onRefresh?.();
  });

  return (
    <div className="rounded-2xl border border-[var(--color-separator)] overflow-hidden">
      {/* header */}
      <div className="px-4 py-3 bg-[var(--color-fill)]/50 flex items-center gap-2.5 flex-wrap">
        <span className="h-8 w-8 rounded-full bg-[var(--color-fill-2)] grid place-items-center shrink-0">
          <User size={15} className="text-steel" />
        </span>
        <span className="font-semibold text-sm">{u.name}</span>
        <Pill tone="gold">{u.role}</Pill>
        {!u.is_active && <Pill tone="alert">disabled</Pill>}
        {changed && <Pill tone="ready"><ShieldCheck size={11} className="inline -mt-px" /> secure</Pill>}
        {u.must_change_password && hasTemp && !lockedOut && !expired && (
          <Pill tone="pending"><Clock size={11} className="inline -mt-px" /> {dToLockout}d left</Pill>
        )}
        {u.must_change_password && hasTemp && lockedOut && !expired && (
          <Pill tone="alert"><AlertTriangle size={11} className="inline -mt-px" /> locked out</Pill>
        )}
        {u.must_change_password && (expired || !hasTemp) && (
          <Pill tone="alert"><AlertTriangle size={11} className="inline -mt-px" /> expired</Pill>
        )}
      </div>

      {/* details */}
      <div className="px-4 py-1">
        <InfoRow label="Login ID" mono>
          <span className="flex items-center gap-2">{u.login_id} <CopyBtn text={u.login_id} label="" /></span>
        </InfoRow>

        {/* contact email — editable inline */}
        <InfoRow label="Contact email" mono={!!u.contact_email} warn={!u.contact_email && !editContact}>
          {editContact ? (
            <div className="flex items-center gap-2">
              <input type="email" value={contactDraft} onChange={(e) => setContactDraft(e.target.value)}
                autoFocus placeholder="owner@gmail.com"
                className="!h-8 !min-h-0 !py-0 !px-2.5 !text-sm !rounded-lg flex-1 num" />
              <Button size="sm" disabled={pending || !contactDraft.trim()} onClick={saveContact}
                className="!h-8 !px-3 !rounded-lg"><Check size={13} /></Button>
              <button onClick={() => { setEditContact(false); setContactDraft(u.contact_email ?? ""); }}
                className="h-8 w-8 grid place-items-center rounded-lg text-steel hover:bg-[var(--color-fill)]">
                <X size={13} />
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-2">
              {u.contact_email ?? "not set"}
              <button onClick={() => setEditContact(true)}
                className="h-6 w-6 grid place-items-center rounded-md text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)] transition-colors"
                title="Edit contact email"><Pencil size={11} /></button>
            </span>
          )}
        </InfoRow>

        <InfoRow label="Last sign-in" value={show(u.last_sign_in_at)} />
        <InfoRow label="Created" value={show(u.created_at)} />
      </div>

      {/* password section */}
      <div className="px-4 pb-4 pt-1">
        {hasTemp && !newPw && (
          <div className={cn("rounded-xl p-3 space-y-2",
            lockedOut ? "bg-[var(--color-red-2)] border border-[var(--color-red)]/30" : "bg-[var(--color-fill)]")}>
            <div className="flex items-center gap-2 text-xs font-semibold text-steel">
              <KeyRound size={12} /> Temporary password
            </div>
            <div className="flex items-center gap-3">
              <code className="num text-base font-bold tracking-wider">{u.temp_password}</code>
              <CopyBtn text={u.temp_password!} label="" />
            </div>
            {lockedOut ? (
              <div className="text-xs text-[var(--color-red)] font-semibold flex items-start gap-1.5 mt-1">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>Locked out. The owner can no longer sign in. Issue a new password.</span>
              </div>
            ) : (
              <div className="text-xs text-steel flex items-center gap-2 flex-wrap">
                <span>Issued {show(u.temp_password_issued)}</span>
                <span className="text-[var(--color-label-3)]">/</span>
                <span className={cn(dToLockout <= 1 ? "text-[var(--color-red)] font-semibold" : dToLockout <= 2 ? "text-[var(--color-orange)] font-semibold" : "")}>
                  {dToLockout}d to sign in
                </span>
                <span className="text-[var(--color-label-3)]">/</span>
                <span>visible for {dLeft}d</span>
              </div>
            )}
            {lockedOut && (
              <Button size="sm" className="mt-1" disabled={pending} onClick={generate}>
                <KeyRound size={13} /> New password
              </Button>
            )}
          </div>
        )}

        {!hasTemp && u.must_change_password && !newPw && (
          <div className="rounded-xl bg-[var(--color-fill)] border border-dashed border-[var(--color-orange)]/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-orange)]">
              <AlertTriangle size={12} /> {expired ? "Password expired" : "No password on file"}
            </div>
            <p className="text-xs text-steel">Generate a new temporary password and share it with the owner.</p>
            <Button size="sm" disabled={pending} onClick={generate}>
              <KeyRound size={13} /> Generate password
            </Button>
          </div>
        )}

        {changed && !newPw && (
          <div className="rounded-xl bg-[var(--color-green-2)] border border-[var(--color-green)]/20 p-3 flex items-center gap-3">
            <ShieldCheck size={16} className="text-[var(--color-green)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[var(--color-green)]">Password set by owner</div>
              <div className="text-xs text-steel mt-0.5">Issue a new temporary one if they are locked out.</div>
            </div>
            <Button size="sm" variant="outline" disabled={pending} onClick={generate}><KeyRound size={13} /></Button>
          </div>
        )}

        {newPw && (
          <div className="rounded-xl bg-[var(--color-green-2)] border border-[var(--color-tint)]/30 p-3 space-y-2">
            <div className="text-xs font-bold text-[var(--color-green)] uppercase tracking-wide">
              New password — valid 7 days
            </div>
            <div className="flex items-center gap-3">
              <code className="num text-base font-bold tracking-wider">{newPw.password}</code>
              <CopyBtn text={`${newPw.email} / ${newPw.password}`} label="Copy" />
            </div>
            <p className="text-xs text-steel">Share with the owner. They must change it at next sign-in.</p>
          </div>
        )}
      </div>

      {err && <div className="px-4 pb-3"><p className="text-sm text-chili">{err}</p></div>}
    </div>
  );
}

/* ── which fields are editable in each section ────────────────────────────── */
const EDITABLE_PROPERTY: Record<string, { type?: string; placeholder?: string }> = {
  name: { placeholder: "Property name" },
  legal_name: { placeholder: "Legal name on the GST certificate" },
  phone: { type: "tel", placeholder: "+91 98765 43210" },
  address: { placeholder: "Full address" },
  district: { placeholder: "District" },
  pincode: { placeholder: "629001" },
  tagline: { placeholder: "A short line for the booking page" },
  booking_slug: { placeholder: "booking-page-url" },
};

const EDITABLE_TAX: Record<string, { type?: string; placeholder?: string }> = {
  gstin: { placeholder: "33ABCDE1234F1Z5" },
  pan: { placeholder: "ABCDE1234F" },
  fssai: { placeholder: "14-digit FSSAI number" },
  ca_name: { placeholder: "Chartered accountant name" },
  ca_firm: { placeholder: "Firm name" },
  ca_phone: { type: "tel", placeholder: "+91 98765 43210" },
  ca_email: { type: "email", placeholder: "ca@example.in" },
};

/* ── a section that toggles between view and inline edit ──────────────────── */
function EditableSection({ icon, title, data, editableKeys, restaurantId, onSaved }: {
  icon: React.ReactNode; title: string; data: Record<string, unknown>;
  editableKeys: Record<string, { type?: string; placeholder?: string }>;
  restaurantId: string; onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const startEdit = () => {
    const d: Record<string, string> = {};
    for (const k of Object.keys(editableKeys)) d[k] = String(data[k] ?? "");
    setDraft(d);
    setEditing(true);
    setErr(null);
  };
  const cancel = () => { setEditing(false); setErr(null); };
  const save = () => start(async () => {
    setErr(null);
    // only send fields that actually changed
    const changed: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v !== String(data[k] ?? "")) changed[k] = v;
    }
    if (Object.keys(changed).length === 0) { setEditing(false); return; }
    const r = await updateProperty(restaurantId, changed);
    if ("error" in r) { setErr(r.error!); return; }
    setEditing(false);
    onSaved?.();
  });

  return (
    <section>
      <SectionHead icon={icon} title={title}
        actions={editing
          ? <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={cancel} disabled={pending}><X size={13} /> Cancel</Button>
              <Button size="sm" onClick={save} disabled={pending}><Save size={13} /> Save</Button>
            </div>
          : <div className="flex items-center gap-2">
              <button onClick={startEdit} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)] transition-colors">
                <Pencil size={11} /> Edit
              </button>
              <CopyBtn text={Object.entries(data).map(([k, v]) => `${label(k)}: ${show(v)}`).join("\n")} />
            </div>}
      />
      <div className="rounded-2xl border border-[var(--color-separator)] px-4 py-1">
        {Object.entries(data).map(([k, v]) => {
          const editable = editableKeys[k];
          const isEditing = editing && !!editable;
          return (
            <div key={k} className="flex items-start gap-3 py-2.5 border-b border-[var(--color-separator)]/50 last:border-0">
              <span className="text-xs text-steel w-28 shrink-0 pt-1.5">{label(k)}</span>
              <span className="text-sm flex-1 min-w-0 break-all">
                {isEditing ? (
                  <input
                    type={editable.type ?? "text"}
                    value={draft[k] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    placeholder={editable.placeholder}
                    className={cn("!h-8 !min-h-0 !py-0 !px-2.5 !text-sm !rounded-lg w-full",
                      /gstin|pan|slug|code|id$|email|phone|fssai|pincode/.test(k) && "num")}
                  />
                ) : (
                  <span className={cn(/gstin|pan|slug|code|id$|email|phone|rate|pct|fssai|pincode/.test(k) && "num")}>
                    {show(v)}
                  </span>
                )}
              </span>
              {!isEditing && editing && !editable && (
                <span className="text-[10px] text-[var(--color-label-3)] pt-1.5 shrink-0">read only</span>
              )}
            </div>
          );
        })}
      </div>
      {err && <p className="text-sm text-chili mt-2 px-1">{err}</p>}
    </section>
  );
}

/* ── content stats as a visual grid ───────────────────────────────────────── */
function ContentGrid({ data }: { data: Record<string, number> }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {Object.entries(data).map(([k, n]) => (
        <div key={k} className={cn("rounded-xl p-3 text-center",
          n > 0 ? "bg-[var(--color-fill)]" : "bg-transparent border border-dashed border-[var(--color-separator)]")}>
          <div className={cn("num text-xl font-bold", n > 0 ? "" : "text-steel")}>{fmt(n)}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-steel mt-0.5">{label(k)}</div>
        </div>
      ))}
    </div>
  );
}

/* ── main detail view ─────────────────────────────────────────────────────── */
export function PropertyDetailView({ detail, restaurantId, onRefresh }: {
  detail: PropertyDetail; restaurantId: string; onRefresh?: () => void }) {
  const { property, tax, users, contents } = detail;

  return (
    <div className="space-y-6">
      {/* top bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-steel">Full record for this property.</p>
        </div>
        <CopyBtn text={asText(detail)} label="Copy all" className="!h-8 !px-3" />
      </div>

      {/* property info — editable */}
      <EditableSection
        icon={<Building2 size={14} />}
        title="Property"
        data={property}
        editableKeys={EDITABLE_PROPERTY}
        restaurantId={restaurantId}
        onSaved={onRefresh}
      />

      {/* users */}
      <section>
        <SectionHead icon={<User size={14} />} title="Users and sign-in"
          actions={<CopyBtn text={users.map((u) => `${u.name} (${u.role}) — ${u.login_id} — ${u.contact_email ?? "no contact"}`).join("\n")} />} />
        <div className="space-y-3">
          {users.length === 0
            ? <p className="text-sm text-steel px-1">No login has been created for this property yet.</p>
            : users.map((u) => <UserCard key={u.login_id} u={u} restaurantId={restaurantId} onRefresh={onRefresh} />)}
        </div>
      </section>

      {/* tax — editable */}
      <EditableSection
        icon={<FileText size={14} />}
        title="Tax & GST"
        data={tax}
        editableKeys={EDITABLE_TAX}
        restaurantId={restaurantId}
        onSaved={onRefresh}
      />

      {/* contents */}
      <section>
        <SectionHead icon={<BarChart3 size={14} />} title="What it holds" />
        <ContentGrid data={contents} />
      </section>
    </div>
  );
}
