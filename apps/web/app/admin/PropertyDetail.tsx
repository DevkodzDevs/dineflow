"use client";
import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, Clock, AlertTriangle, ShieldCheck, Pencil, X, User, Building2, FileText, BarChart3, Save, Palmtree, UtensilsCrossed } from "lucide-react";
import { Button, Pill, cn } from "@/components/ui";
import type { PropertyDetail } from "./actions";
import { resetPropertyPassword, setContactEmail, updateProperty } from "./actions";

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const when = (v: string) => new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—"
  : typeof v === "boolean" ? (v ? "Yes" : "No")
  : ISO.test(String(v)) && !Number.isNaN(Date.parse(String(v))) ? when(String(v))
  : String(v);
const empty = (v: unknown) => v === null || v === undefined || v === "";
/** Identifiers — ids, slugs, codes, logins — wrap anywhere and get a copy button; they were set in the
 *  condensed display font with `.num`'s nowrap, and a UUID ran 40px out of the dialog. */
const isIdent = (k: string) => /(^id$|_id$|slug|login|gstin|^pan$|fssai)/.test(k);
const isNum = (k: string) => /(phone|rate|pct|pincode|amount|count)/.test(k);
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
    <button type="button" aria-label={l ? undefined : done ? "Copied" : "Copy"} title={l ? undefined : "Copy"}
      className={cn("inline-flex items-center justify-center gap-1.5 !min-h-0 h-9 [@media(pointer:coarse)]:h-11 rounded-full text-xs font-semibold transition-colors shrink-0",
        l ? "px-3.5" : "w-9 [@media(pointer:coarse)]:w-11",
        done ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)]", className)}
      onClick={() => { void navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }}>
      {done ? <><Check size={13} />{l && " Copied"}</> : <><Copy size={13} />{l && ` ${l}`}</>}
    </button>
  );
}

/** A section is one card: its title and actions in a header strip, its rows below. */
function Panel({ icon, title, sub, actions, children }: { icon: React.ReactNode; title: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-[var(--color-separator)] overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 bg-[color-mix(in_srgb,var(--color-fill)_55%,transparent)] border-b border-[var(--color-separator)]">
        <span className="h-9 w-9 rounded-xl bg-[var(--color-fill-2)] grid place-items-center text-[var(--color-label-2)] shrink-0">{icon}</span>
        <span className="flex-1 min-w-0"><span className="block text-[15px] font-semibold leading-tight truncate">{title}</span>{sub && <span className="block text-[11.5px] text-steel truncate">{sub}</span>}</span>
        {actions && <span className="flex items-center gap-2 shrink-0">{actions}</span>}
      </header>
      {children}
    </section>
  );
}

/** One label + value. Stacked (label over value) when the card is narrow, side by side from 28rem
 *  of card — a container query, so a phone, a narrow sheet and a wide one each get the right one. */
function Row({ k, label: l, children, tail }: { k?: string; label: string; children: React.ReactNode; tail?: React.ReactNode }) {
  return (
    <div className="@container border-b border-[var(--color-separator)] last:border-0" data-row={k}>
      <div className="flex flex-col gap-1 py-3 @[28rem]:flex-row @[28rem]:items-center @[28rem]:gap-4 @[28rem]:py-2.5 min-h-[52px] justify-center">
        <span className="text-[11.5px] font-medium text-steel @[28rem]:w-36 shrink-0">{l}</span>
        <span className="flex items-center gap-2 flex-1 min-w-0">
          <span className="flex-1 min-w-0 text-[14.5px] leading-snug [overflow-wrap:anywhere]">{children}</span>
          {tail}
        </span>
      </div>
    </div>
  );
}
function Value({ k, v }: { k: string; v: unknown }) {
  if (empty(v)) return <span className="text-[var(--color-label-3)]">Not set</span>;
  if (typeof v === "boolean") return <span className={cn("inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold", v ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)] text-steel")}>{v ? "Yes" : "No"}</span>;
  if (isIdent(k)) return <span className="font-sans text-[13px] tabular-nums break-all">{String(v)}</span>;
  return <span className={cn(isNum(k) && "tabular-nums")}>{show(v)}</span>;
}

function InfoRow({ label: l, value, children, warn }: { label: string; value?: string; mono?: boolean; warn?: boolean; children?: React.ReactNode }) {
  return <Row label={l}><span className={cn(warn && "text-[var(--color-orange)]")}>{children ?? value ?? "—"}</span></Row>;
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
      <div className="px-4">
        <InfoRow label="Login ID" mono>
          <span className="flex items-center gap-2"><span className="flex-1 min-w-0 font-sans text-[13px] tabular-nums break-all">{u.login_id}</span><CopyBtn text={u.login_id} label="" /></span>
        </InfoRow>

        {/* contact email — editable inline */}
        <InfoRow label="Contact email" mono={!!u.contact_email} warn={!u.contact_email && !editContact}>
          {editContact ? (
            <div className="flex items-center gap-2">
              <input type="email" value={contactDraft} onChange={(e) => setContactDraft(e.target.value)}
                autoFocus placeholder="owner@gmail.com"
                className="!h-10 [@media(pointer:coarse)]:!h-11 !min-h-0 !py-0 !px-3 !text-sm !rounded-xl flex-1 min-w-0" />
              <Button size="sm" disabled={pending || !contactDraft.trim()} onClick={saveContact}
                className="!h-10 [@media(pointer:coarse)]:!h-11 !px-3 !rounded-xl shrink-0" aria-label="Save contact email"><Check size={14} /></Button>
              <button onClick={() => { setEditContact(false); setContactDraft(u.contact_email ?? ""); }}
                className="h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 grid place-items-center rounded-xl text-steel hover:bg-[var(--color-fill)]" aria-label="Cancel">
                <X size={13} />
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-2">
              <span className="flex-1 min-w-0 break-all">{u.contact_email ?? "Not set"}</span>
              <button type="button" onClick={() => setEditContact(true)} aria-label="Edit contact email"
                className="h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 grid place-items-center rounded-full bg-[var(--color-fill)] text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)] transition-colors"
                title="Edit contact email"><Pencil size={13} /></button>
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
              <code className="font-sans text-base font-bold tracking-wider tabular-nums break-all flex-1 min-w-0">{u.temp_password}</code>
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
              <code className="font-sans text-base font-bold tracking-wider tabular-nums break-all flex-1 min-w-0">{newPw.password}</code>
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

  const filled = Object.values(data).filter((v) => !empty(v)).length;
  return (
    <div>
      <Panel icon={icon} title={title} sub={editing ? "Editing — fields without a box are read only" : `${filled} of ${Object.keys(data).length} filled in`}
        actions={editing
          ? <>
              <Button size="sm" variant="outline" onClick={cancel} disabled={pending} className="!h-9 [@media(pointer:coarse)]:!h-11"><X size={13} /> Cancel</Button>
              <Button size="sm" onClick={save} disabled={pending} className="!h-9 [@media(pointer:coarse)]:!h-11"><Save size={13} /> Save</Button>
            </>
          : <>
              <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 !min-h-0 h-9 [@media(pointer:coarse)]:h-11 px-3.5 rounded-full text-xs font-semibold bg-[var(--color-fill)] text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)] transition-colors">
                <Pencil size={13} /> Edit
              </button>
              <CopyBtn text={Object.entries(data).map(([k, v]) => `${label(k)}: ${show(v)}`).join("\n")} label="" />
            </>}>
        <div className="px-4">
          {Object.entries(data).map(([k, v]) => {
            const editable = editableKeys[k];
            const isEditing = editing && !!editable;
            return (
              <Row key={k} k={k} label={label(k)}
                tail={!editing && isIdent(k) && !empty(v) ? <CopyBtn text={String(v)} label="" /> : undefined}>
                {isEditing ? (
                  <input
                    type={editable.type ?? "text"}
                    value={draft[k] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    placeholder={editable.placeholder} aria-label={label(k)}
                    className={cn("!h-10 [@media(pointer:coarse)]:!h-11 !min-h-0 !py-0 !px-3 !text-sm !rounded-xl w-full", isIdent(k) && "tabular-nums")}
                  />
                ) : <Value k={k} v={v} />}
              </Row>
            );
          })}
        </div>
      </Panel>
      {err && <p className="text-sm text-chili mt-2 px-1">{err}</p>}
    </div>
  );
}

/* ── content stats as a visual grid ───────────────────────────────────────── */
function ContentGrid({ data }: { data: Record<string, number> }) {
  return (
    <div className="p-3 grid gap-2 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
      {Object.entries(data).map(([k, n]) => (
        <div key={k} className={cn("min-w-0 rounded-2xl px-3 py-3",
          n > 0 ? "bg-[var(--color-fill)]" : "border border-dashed border-[var(--color-separator)]")}>
          <div className={cn("text-[22px] leading-none font-semibold tabular-nums", n > 0 ? "" : "text-[var(--color-label-3)]")}>{fmt(n)}</div>
          <div className="text-[11.5px] text-steel mt-1.5 leading-tight [overflow-wrap:anywhere]">{label(k)}</div>
        </div>
      ))}
    </div>
  );
}

/* ── main detail view ─────────────────────────────────────────────────────── */
export function PropertyDetailView({ detail, restaurantId, onRefresh }: {
  detail: PropertyDetail; restaurantId: string; onRefresh?: () => void }) {
  const { property, tax, users, contents } = detail;

  const p = property as Record<string, unknown>;
  const kind = String(p.property_type ?? p.type ?? "");
  const total = Object.values(contents).reduce((a, n) => a + n, 0);
  return (
    <div className="space-y-4">
      {/* who this is, at a glance, and the one action that takes everything */}
      <div className="rounded-[20px] border border-[var(--color-separator)] p-4 flex flex-wrap items-center gap-3">
        <span className="h-12 w-12 rounded-2xl grid place-items-center shrink-0 bg-[var(--color-green-2)] text-[var(--color-green)]">{kind === "resort" ? <Palmtree size={22} /> : kind === "restaurant" ? <UtensilsCrossed size={22} /> : <Building2 size={22} />}</span>
        <span className="flex-1 min-w-[10rem]">
          <span className="block font-display text-[22px] leading-tight [overflow-wrap:anywhere]">{show(p.name)}</span>
          <span className="flex flex-wrap gap-1.5 mt-1.5">
            {kind && <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold capitalize">{kind}</span>}
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold">{users.length} login{users.length === 1 ? "" : "s"}</span>
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[var(--color-fill)] text-[11.5px] font-semibold tabular-nums">{fmt(total)} records</span>
          </span>
        </span>
        <CopyBtn text={asText(detail)} label="Copy all" />
      </div>

      {/* property info — editable */}
      <EditableSection
        icon={<Building2 size={16} />}
        title="Property"
        data={property}
        editableKeys={EDITABLE_PROPERTY}
        restaurantId={restaurantId}
        onSaved={onRefresh}
      />

      {/* users */}
      <Panel icon={<User size={16} />} title="Users and sign-in" sub={users.length ? `${users.length} login${users.length === 1 ? "" : "s"}` : "No logins yet"}
        actions={<CopyBtn text={users.map((u) => `${u.name} (${u.role}) — ${u.login_id} — ${u.contact_email ?? "no contact"}`).join("\n")} label="" />}>
        <div className="p-3 space-y-3">
          {users.length === 0
            ? <p className="text-sm text-steel px-1 py-2">No login has been created for this property yet.</p>
            : users.map((u) => <UserCard key={u.login_id} u={u} restaurantId={restaurantId} onRefresh={onRefresh} />)}
        </div>
      </Panel>

      {/* tax — editable */}
      <EditableSection
        icon={<FileText size={16} />}
        title="Tax & GST"
        data={tax}
        editableKeys={EDITABLE_TAX}
        restaurantId={restaurantId}
        onSaved={onRefresh}
      />

      {/* contents */}
      <Panel icon={<BarChart3 size={16} />} title="What it holds" sub={`${fmt(total)} records in all`}>
        <ContentGrid data={contents} />
      </Panel>
    </div>
  );
}
