"use client";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Building2, Palmtree, UtensilsCrossed, KeyRound, Copy, Pause, Play, Clock, Search, MoreHorizontal } from "lucide-react";
import { Button, Sheet, Field, StatTile, cn, Pill, Waiting, PasswordInput } from "@/components/ui";
import { formatINR, PROPERTY_LABEL, type PropertyType } from "@dineflow/shared";
import { daysLeft } from "@/lib/format";
import { issueKey, setMembership, actAs, setMasterPassword, createProperty, installEstate, resetPropertyPassword, deletePreview, deleteProperty, propertyDetail, setContactEmail, type DeletePreview, type PropertyDetail } from "./actions";
import { Trash2 } from "lucide-react";
import { PropertyDetailView } from "./PropertyDetail";
import { RowActions } from "./RowActions";
import { LoginIdField } from "./LoginIdField";
import { loginAddressProblem } from "@dineflow/shared";
import { Boxes } from "lucide-react";
import { Plus, UtensilsCrossed as UC, Building2 as B2, Palmtree as PT } from "lucide-react";
import { useRouter } from "next/navigation";
import { KeyRound as KeyIcon, X } from "lucide-react";
import { MODULES_BY_TYPE, MODULE_GROUPS, ALWAYS_ON, PLAN_PRESETS, PROPERTY_FILTERS, type PlanPreset } from "@dineflow/shared";
import { DataTable } from "@/components/ui/DataTable";
import { setModules } from "./actions";
import styles from "./AdminToolbar.module.css";

type T = { id: string; name: string; property_type: PropertyType; membership: string; trial_ends_at: string; membership_ends_at: string | null; plan: string | null; users: number; sales_today: number; sales_30d: number; open_orders: number; rooms: number; occupied_rooms: number; created_at: string };
type K = { code: string; plan: string; days: number; restaurant_id: string | null; redeemed_by: string | null; redeemed_at: string | null; created_at: string };
type L = { id: string; action: string; target: string | null; meta: Record<string, unknown>; created_at: string };
const STATUSES = [
  { v: "all", label: "All statuses", dot: "var(--color-label-3)" },
  { v: "active", label: "Active", dot: "var(--color-tint)" },
  { v: "trial", label: "Trial", dot: "var(--color-orange)" },
  { v: "expired", label: "Expired", dot: "var(--color-red)" },
  { v: "box", label: "On a Box", dot: "var(--color-blue)" },
] as const;
/* both dropdowns close the same two ways: Escape back to the trigger, or focus leaving the popover */
const popover = {
  onKeyDown: (e: KeyboardEvent<HTMLDetailsElement>) => { if (e.key === "Escape" && e.currentTarget.open) { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } },
  onBlur: (e: FocusEvent<HTMLDetailsElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.open = false; },
};
const shut = (e: { currentTarget: HTMLElement }) => { const d = e.currentTarget.closest("details"); if (d) d.open = false; };

const Icon = ({ t }: { t: PropertyType }) => (t === "hotel" ? <Building2 size={16} /> : t === "resort" ? <Palmtree size={16} /> : <UtensilsCrossed size={16} />);

export function AdminClient({ tenants, keys, log, tab, boxes = [], access = [], codes = [] }: { tenants: T[]; keys: K[]; log: L[]; tab: "properties" | "keys"; access?: { id: string; enabled_modules: string[] | null }[]; codes?: { id: string; code: string | null }[]; boxes?: { restaurant_id: string; runs_on_box: boolean; last_seen: string | null; sales_today: number | null }[] }) {
  const boxOf = (id: string) => boxes.find((b) => b.restaurant_id === id);
  const codeOf = (id: string) => codes.find((c) => c.id === id)?.code ?? null;
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<T | null>(null); const [issued, setIssued] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sheet, setSheetState] = useState<"tenant" | "key" | "password" | "new" | "estate" | "access" | "delete" | "detail" | null>(null);
  const router = useRouter();
  const [mods, setMods] = useState<string[] | null>(null);   // the set being edited in the Access sheet
  const [pw, setPw] = useState("");
  // off by default: a new property should open empty unless sample data is asked for
  const [np, setNp] = useState({ name: "", type: "resort" as "restaurant" | "hotel" | "resort", demo: false, email: "", owner: "", contact: "" });
  const [estate, setEstate] = useState<{ name: string; type: string; email: string; password: string }[] | null>(null);
  // shown once, straight after creating a property or resetting a password. Never readable again.
  const [creds, setCreds] = useState<{ title: string; email: string; password: string; code?: string | null } | null>(null);
  // the delete confirmation: what would be destroyed, and the name the operator has to type back
  const [del, setDel] = useState<(DeletePreview & { id: string }) | null>(null);
  const [delText, setDelText] = useState("");
  const [detail, setDetail] = useState<PropertyDetail | null>(null);   // the full-record dialog
  const [contact, setContact] = useState("");                          // editing where codes are sent
  const find = useRef<HTMLInputElement>(null);
  const match = (t: T) => filter === "all" || (filter === "box" ? boxes.some((b) => b.restaurant_id === t.id && b.runs_on_box)
    : filter === "expired" ? ["expired", "suspended"].includes(t.membership)
    : t.membership === filter || t.property_type === filter);
  const list = useMemo(() => tenants.filter((t) => match(t) && t.name.toLowerCase().includes(q.trim().toLowerCase())), [tenants, boxes, q, filter]);   // eslint-disable-line react-hooks/exhaustive-deps
  const onBox = (id: string) => boxes.some((b) => b.restaurant_id === id && b.runs_on_box);
  /* every chip carries its own count, so the split of the estate is readable without filtering first */
  const counts = useMemo(() => ({
    all: tenants.length,
    active: tenants.filter((t) => t.membership === "active").length,
    trial: tenants.filter((t) => t.membership === "trial").length,
    expired: tenants.filter((t) => ["expired", "suspended"].includes(t.membership)).length,
    box: tenants.filter((t) => onBox(t.id)).length,
  }), [tenants, boxes]);   // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = q.trim() !== "" || filter !== "all";
  /* "/" jumps to the find field the way it does in every other console */
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = document.activeElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      e.preventDefault(); find.current?.focus();
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const mrr = tenants.filter((t) => t.membership === "active").reduce((s, t) => s + (t.plan === "yearly" ? 24999 / 12 : 2499), 0);
  const nameOf = (id: string | null) => tenants.find((t) => t.id === id)?.name ?? "—";
  const tone = (m: string) => (m === "active" ? "ready" : m === "trial" ? "gold" : "alert") as "ready" | "gold" | "alert";

  return (
    <div className="space-y-6">
      <div className="aurora"><div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Platform</div><h1 className="text-4xl">{tenants.length} properties <em>under control</em></h1></div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Active memberships" value={String(tenants.filter((t) => t.membership === "active").length)} tone="good" />
        <StatTile label="On trial" value={String(tenants.filter((t) => t.membership === "trial").length)} sub={`${tenants.filter((t) => t.membership === "trial" && daysLeft(t.trial_ends_at) <= 2).length} expiring in 2 days`} delay={0.05} />
        <StatTile label="Expired / suspended" value={String(tenants.filter((t) => ["expired", "suspended"].includes(t.membership)).length)} tone={tenants.some((t) => t.membership === "expired") ? "alert" : undefined} delay={0.1} />
        <StatTile label="Est. MRR" value={formatINR(mrr)} delay={0.15} />
        <StatTile label="Clients' sales today" value={formatINR(tenants.reduce((s, t) => s + Number(t.sales_today), 0))} delay={0.2} />
      </div>

      <div className={styles.bar}>
      <section className={styles.panel} aria-label="Property management controls">
        <div className={styles.top}>
          <nav className={styles.tabs} aria-label="Master control sections">
            <Link href="/admin" aria-current={tab === "properties" ? "page" : undefined} className={cn(styles.tab, tab === "properties" && styles.active)}><Building2 size={15} aria-hidden="true" /><span className={styles.tabLabel}>Properties</span><span className={styles.count}>{tenants.length}</span></Link>
            <Link href="/admin?tab=keys" aria-current={tab === "keys" ? "page" : undefined} className={cn(styles.tab, tab === "keys" && styles.active)}><KeyRound size={15} aria-hidden="true" /><span className={styles.tabLabel}>Membership keys</span><span className={styles.count}>{keys.length}</span></Link>
          </nav>

          {tab === "properties" && <div className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input ref={find} aria-label="Find a property" placeholder="Find a property" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }} />
            {q ? <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => { setQ(""); find.current?.focus(); }}><X size={12} /></button>
               : <kbd className={styles.kbd} aria-hidden="true">/</kbd>}
          </div>}

          <div className={styles.actions}>
            <Button className={styles.action} onClick={() => { setErr(null); setSheet(tab === "properties" ? "new" : "key"); }}>
              {tab === "properties" ? <Plus size={15} /> : <KeyRound size={15} />}{tab === "properties" ? "New property" : "Issue key"}
            </Button>
            <details className={styles.pop} {...popover}>
              <summary className={styles.more} aria-haspopup="menu" aria-label="More actions" title="More actions"><MoreHorizontal size={18} /></summary>
              <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={(e) => { setErr(null); setSheet(tab === "properties" ? "key" : "new"); shut(e); }}>{tab === "properties" ? <KeyRound size={15} /> : <Plus size={15} />}{tab === "properties" ? "Issue key" : "New property"}</button>
                <button type="button" role="menuitem" onClick={(e) => { setErr(null); setSheet("estate"); shut(e); }}><Boxes size={15} /> Sample estate</button>
                <button type="button" role="menuitem" className={styles.sep} onClick={(e) => { setErr(null); setSheet("password"); shut(e); }}><KeyIcon size={15} /> Change master password</button>
              </div>
            </details>
          </div>
        </div>

        {tab === "properties" && <div className={styles.filters}>
          <div className={styles.chips} role="group" aria-label="Filter properties by status">
            {STATUSES.map((s) => (
              <button key={s.v} type="button" aria-pressed={filter === s.v} style={{ "--chip": s.dot } as CSSProperties}
                className={cn(styles.chip, filter === s.v && styles.on)} onClick={() => setFilter(s.v)}>
                <span className={styles.dot} aria-hidden="true" />{s.label}<span className={styles.chipCount}>{counts[s.v]}</span>
              </button>
            ))}
          </div>
          <p className={styles.meta} aria-live="polite">
            <span>{filtered ? <><b className="num">{list.length}</b> of {tenants.length} shown</> : <><b className="num">{tenants.length}</b> {tenants.length === 1 ? "property" : "properties"}</>}</span>
            {filtered && <button type="button" className={styles.reset} onClick={() => { setQ(""); setFilter("all"); }}><X size={12} aria-hidden="true" /> Clear</button>}
          </p>
        </div>}
      </section>
      </div>

      {tab === "properties" ? (
        <DataTable rows={list as unknown as Record<string, unknown>[]} rowKey="id" search={["name", "property_type", "membership"] as never} pageSize={20}
          empty={filtered ? "No properties match this filter" : "No properties yet — press New property"}
          columns={[
            { key: "name", label: "Property", primary: true, render: (r) => { const t = r as unknown as T; return <div className="flex items-center gap-3"><span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0"><Icon t={t.property_type} /></span><div className="min-w-0"><div className="font-semibold truncate">{t.name}</div><div className="text-xs text-steel truncate">{codeOf(t.id) ? <span className="num">{codeOf(t.id)}</span> : t.property_type}{boxes.find((b) => b.restaurant_id === t.id)?.runs_on_box ? " · on a Box" : ""}</div></div></div>; } },
            { key: "membership", label: "Membership", render: (r) => { const t = r as unknown as T; return <><Pill tone={tone(t.membership)}>{t.membership}</Pill><div className="text-xs text-steel mt-1 num">{t.membership === "trial" ? `${daysLeft(t.trial_ends_at)}d left` : t.membership_ends_at ? `${daysLeft(t.membership_ends_at)}d left` : ""}</div></>; } },
            { key: "sales_today", label: "Today", num: true, render: (r) => <span className="font-semibold">{formatINR(Number(r.sales_today))}</span> },
            { key: "sales_30d", label: "30 days", num: true, hideOnPhone: true, render: (r) => <span className="text-steel">{formatINR(Number(r.sales_30d))}</span> },
            { key: "open_orders", label: "Live", num: true, hideOnPhone: true, render: (r) => { const t = r as unknown as T; return <span className="text-steel">{t.open_orders} orders{t.rooms ? ` · ${t.occupied_rooms}/${t.rooms} rooms` : ""}</span>; } },
            { key: "users", label: "Users", num: true, hideOnPhone: true },
          ]}
          actions={(r) => { const t = r as unknown as T; return (
            <RowActions
              name={t.name} code={codeOf(t.id)} pending={pending}
              onOpen={() => { const tab = window.open("", "_blank"); start(async () => { const x = await actAs(t.id); if ("error" in x) { tab?.close(); setErr(x.error!); } else if (tab) tab.location.href = "/dashboard"; else router.push("/dashboard"); }); }}
              onDetails={() => openDetail(t)}
              onAccess={() => { setSel(t); setMods(access.find((x) => x.id === t.id)?.enabled_modules ?? null); setErr(null); setSheet("access"); }}
              onManage={() => { setSel(t); setIssued(null); setErr(null); setSheet("tenant"); }}
              onDelete={() => { setSel(t); setErr(null); setDelText(""); setDel(null); setSheet("delete"); start(async () => { const p = await deletePreview(t.id); if ("error" in p) setErr(p.error!); else setDel({ ...(p as DeletePreview), id: t.id }); }); }}
            />); }} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="feather divide-y divide-line">
            {keys.length === 0 && <p className="p-6 text-sm text-steel">No keys issued yet.</p>}
            {keys.map((k) => (
              <div key={k.code} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="num font-semibold tracking-[0.15em]">{k.code}</span><Pill tone="gold">{k.plan}</Pill>
                <span className="text-steel flex-1 truncate">{k.restaurant_id ? `for ${nameOf(k.restaurant_id)}` : "any property"}</span>
                {k.redeemed_at ? <Pill tone="served">used · {nameOf(k.redeemed_by)}</Pill> : <button onClick={() => navigator.clipboard.writeText(k.code)} className="text-steel hover:text-ink" aria-label="Copy"><Copy size={15} /></button>}
              </div>
            ))}
          </div>
          <div className="feather p-5"><div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Audit log</div>
            <ul className="space-y-2 text-sm">{log.map((l) => <li key={l.id} className="flex gap-2"><span className="num text-xs text-steel w-24 shrink-0">{l.created_at.slice(5, 16).replace("T", " ")}</span><span><b>{l.action.replace("_", " ")}</b> {l.target ? nameOf(l.target) : ""} <span className="text-steel">{JSON.stringify(l.meta)}</span></span></li>)}</ul></div>
        </div>
      )}

      <Sheet open={sheet === "access" && !!sel} onClose={() => setSheet(null)} title={sel ? `Access · ${sel.name}` : ""} wide>
        {sel && <AccessPanel sel={sel} mods={mods} setMods={setMods} pending={pending} err={err}
          onSave={() => start(async () => { const r = await setModules(sel.id, mods); if ("error" in r) setErr(r.error!); else { setSheet(null); router.refresh(); } })}
          onCancel={() => setSheet(null)} access={access} />}
      </Sheet>
      <Sheet open={sheet === "tenant" && !!sel} onClose={() => { setSheet(null); setCreds(null); setDel(null); setDelText(""); setErr(null); }} title={sel?.name ?? ""}>
        {sel && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm"><div className="feather p-3"><div className="text-xs text-steel">Type</div><div className="font-semibold">{PROPERTY_LABEL[sel.property_type]}</div></div><div className="feather p-3"><div className="text-xs text-steel">Status</div><Pill tone={tone(sel.membership)}>{sel.membership}</Pill></div><div className="feather p-3"><div className="text-xs text-steel">30-day sales</div><div className="num font-semibold">{formatINR(Number(sel.sales_30d))}</div></div><div className="feather p-3"><div className="text-xs text-steel">Team</div><div className="num font-semibold">{sel.users} users</div></div></div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-steel">Membership control</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setMembership(sel.id, "trial", 7); if ("error" in r) setErr(r.error!); })}><Clock size={15} /> Extend trial +7d</Button>
                <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setMembership(sel.id, "active", 30); if ("error" in r) setErr(r.error!); })}><Play size={15} /> Activate 30d</Button>
                <Button variant="outline" disabled={pending} onClick={() => start(async () => { const r = await setMembership(sel.id, "active", 365); if ("error" in r) setErr(r.error!); })}><Play size={15} /> Activate 1 year</Button>
                {sel.membership === "suspended" ? <Button variant="outline" disabled={pending} onClick={() => start(async () => { await setMembership(sel.id, "active", null); })}>Unsuspend</Button>
                  : <Button variant="danger" disabled={pending} onClick={() => { if (confirm(`Suspend ${sel.name}? Their team will be locked out immediately.`)) start(async () => { await setMembership(sel.id, "suspended", null); }); }}><Pause size={15} /> Suspend</Button>}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-steel">Issue a key for this property</div>
              <div className="grid grid-cols-2 gap-2"><Button disabled={pending} onClick={() => start(async () => { const r = await issueKey("monthly", sel.id); if ("code" in r) setIssued(r.code!); else setErr(r.error!); })}>Monthly key</Button><Button disabled={pending} variant="ink" onClick={() => start(async () => { const r = await issueKey("yearly", sel.id); if ("code" in r) setIssued(r.code!); else setErr(r.error!); })}>Yearly key</Button></div>
              {issued && <div className="feather p-4 text-center"><div className="num text-2xl tracking-[0.2em] font-semibold">{issued}</div><button className="text-xs text-steel mt-1 underline" onClick={() => navigator.clipboard.writeText(issued)}>Copy and send to the owner</button></div>}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-steel">Owner login</div>
              {creds ? (
                <div className="feather p-4 space-y-3">
                  <div><div className="text-[11px] uppercase tracking-wide text-steel">User ID</div><div className="num font-semibold break-all">{creds.email}</div></div>
                  <div><div className="text-[11px] uppercase tracking-wide text-steel">Temporary password</div><div className="num font-semibold">{creds.password}</div></div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${creds.email} / ${creds.password}`)}><Copy size={14} /> Copy</Button>
                    <Button size="sm" variant="plain" onClick={() => setCreds(null)}>Hide</Button>
                  </div>
                  <p className="text-xs text-steel">Shown once. They must choose their own password at the next sign-in.</p>
                </div>
              ) : (
                <Button variant="outline" className="w-full" disabled={pending} onClick={() => start(async () => {
                  setErr(null);
                  const r = await resetPropertyPassword(sel.id);
                  if ("error" in r) setErr(r.error!); else setCreds({ title: "", email: r.login_email, password: r.temp_password });
                })}><KeyIcon size={15} /> Issue a new temporary password</Button>
              )}
              <Field label="Owner's real email" hint="Where the one-time code is sent when they change their password. Without it they cannot.">
                <input value={contact} onChange={(e) => setContact(e.target.value)} type="email" placeholder="priya@gmail.com" />
              </Field>
              <Button size="sm" variant="outline" disabled={pending || !contact.trim()} onClick={() => start(async () => {
                setErr(null);
                const r = await setContactEmail(sel.id, contact);
                if ("error" in r) setErr(r.error!); else { setContact(""); setErr(null); router.refresh(); }
              })}>Save this address</Button>
            </div>
            <div className="space-y-2 pt-1 border-t border-line">
              <div className="text-xs font-semibold uppercase tracking-wide text-chili">Danger zone</div>
              <Button variant="danger" className="w-full" disabled={pending} onClick={() => {
                setErr(null); setDelText(""); setDel(null); setSheet("delete");
                start(async () => { const p = await deletePreview(sel.id); if ("error" in p) setErr(p.error!); else setDel({ ...(p as DeletePreview), id: sel.id }); });
              }}><Trash2 size={15} /> Delete this property…</Button>
            </div>
            {err && <p className="text-sm text-chili">{err}</p>}
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === "detail" && !!sel} onClose={() => { setSheet(null); setDetail(null); setErr(null); }} title={sel ? `${sel.name} · full record` : "Details"} wide>
        {err && <p className="text-sm text-chili mb-3">{err}</p>}
        {detail && sel ? <PropertyDetailView detail={detail} restaurantId={sel.id}
          onRefresh={() => { if (!sel) return; start(async () => { const r = await propertyDetail(sel.id); if (!("error" in r)) setDetail(r.detail); }); }} />
          : !err && <p className="text-sm text-steel">Loading the record…</p>}
      </Sheet>

      {/* One confirmation, reached either from the Delete button on the row or from Manage.
          The name has to be typed back: this wipes trading history, invoices and tax filings, and
          a mis-aimed click should not be able to do that. */}
      <Sheet open={sheet === "delete" && !!sel} onClose={() => { setSheet(null); setDel(null); setDelText(""); setErr(null); }} title={sel ? `Delete ${sel.name}?` : "Delete"}>
        {sel && (
          <div className="space-y-4">
            <p className="text-sm">This removes <b>{sel.name}</b>, everything in it, and the logins that belong to it. <b>It cannot be undone.</b></p>
            {!del ? <p className="text-sm text-steel">Counting what is in there…</p> : (<>
              <div className="feather p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">What goes with it</div>
                <ul className="text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                  {([["login", del.logins], ["menu item", del.menu_items], ["order", del.orders], ["bill", del.bills],
                     ["invoice", del.invoices], ["booking", del.bookings], ["guest", del.guests], ["room", del.rooms],
                     ["staff record", del.staff], ["tax document", del.tax_docs], ["tax filing", del.tax_filings],
                     ["sealed month", del.sealed_months]] as const).map(([label, n]) => (
                    <li key={label} className={n > 0 ? "" : "text-steel"}>
                      <span className="num font-semibold">{n}</span> {label}{n === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              </div>
              <Field label={`Type “${del.name}” to confirm`}>
                <input value={delText} onChange={(e) => setDelText(e.target.value)} placeholder={del.name} autoFocus autoComplete="off" />
              </Field>
            </>)}
            {err && <p className="text-sm text-chili">{err}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => { setSheet(null); setDel(null); setDelText(""); }}>Keep it</Button>
              <Button variant="danger" disabled={pending || !del || delText.trim().toLowerCase() !== del.name.trim().toLowerCase()}
                onClick={() => start(async () => {
                  setErr(null);
                  const r = await deleteProperty(sel.id, delText);
                  if ("error" in r) setErr(r.error!);
                  else { setDel(null); setDelText(""); setSel(null); setSheet(null); router.refresh(); }
                })}><Trash2 size={15} /> Delete for good</Button>
            </div>
          </div>
        )}
      </Sheet>
      <Sheet open={sheet === "estate"} onClose={() => setSheet(null)} title="Load the sample estate" wide>
        {pending && <Waiting expect={60} line="Building six properties and sixty days of history" className="mb-4" />}
        <div className="space-y-4">
          {!estate ? (<>
            <p className="text-sm text-steel">Creates <b>six working properties</b> — two restaurants, two hotels, two resorts — each with its own owner login, 60 days of trading history, rooms and bookings, labour, printers and channels. All six sit in one district, which is exactly the minimum the Neighbours network needs, so the price index and area signal show real figures.</p>
            <ul className="text-sm text-steel space-y-1 list-disc pl-5">
              <li>Sealed months, so <b>Proof of business</b> has a verified record to share</li>
              <li>Two months of covers, so the <b>Tomorrow brief</b> actually predicts</li>
              <li>Priced purchases, so <b>Neighbours → What things cost</b> has a median to compare against</li>
            </ul>
            <p className="text-xs text-steel">Takes about a minute. Safe to press again — it skips anything that already exists.</p>
            {err && <p className="text-sm text-chili">{err}</p>}
            <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await installEstate(); if ("error" in r) setErr(r.error!); else setEstate(r.properties!); })}>{pending ? "Building six properties…" : "Load the sample estate"}</Button>
          </>) : (<>
            <p className="text-sm text-mint font-semibold">Six properties created. These are their logins — every one uses the same password.</p>
            <div className="feather overflow-hidden"><div className="table-wrap"><table className="w-full text-sm"><thead><tr><th className="text-left px-3 py-2">Property</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Email</th><th className="text-left px-3 py-2">Password</th></tr></thead>
              <tbody>{estate.map((p) => <tr key={p.email} className="border-t border-line"><td className="px-3 py-2 font-semibold">{p.name}</td><td className="px-3 py-2 capitalize text-steel">{p.type}</td><td className="px-3 py-2 num">{p.email}</td><td className="px-3 py-2 num">{p.password}</td></tr>)}</tbody></table></div></div>
            <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(estate.map((p) => `${p.name} (${p.type}) — ${p.email} / ${p.password}`).join("\n")); }}>Copy all logins</Button>
            <p className="text-xs text-steel">Sign in as any of them to see the app as a client, or press <b>Open</b> on their row here to walk in as Master. Change or delete these before you go live.</p>
            <Button className="w-full" onClick={() => { setEstate(null); setSheet(null); }}>Done</Button>
          </>)}
        </div>
      </Sheet>
      <Sheet open={sheet === "new"} onClose={() => { setSheet(null); setCreds(null); }} title={creds ? "Give these to the owner" : "Create a property"}>
        <div className="space-y-4">
          {creds ? (<>
            <p className="text-sm text-steel">{creds.title} The password is shown <b>once</b> — it is stored only as a hash and cannot be read again. If it is lost, issue a new one from the property&rsquo;s row.</p>
            <div className="feather p-4 space-y-3">
              {creds.code && <div><div className="text-[11px] uppercase tracking-wide text-steel">DineFlow code</div><div className="num text-lg font-semibold break-all">{creds.code}</div></div>}
              <div><div className="text-[11px] uppercase tracking-wide text-steel">User ID</div><div className="num text-lg font-semibold break-all">{creds.email}</div></div>
              <div><div className="text-[11px] uppercase tracking-wide text-steel">Temporary password</div><div className="num text-lg font-semibold">{creds.password}</div></div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => navigator.clipboard.writeText([creds.code && `DineFlow code: ${creds.code}`, `User ID: ${creds.email}`, `Temporary password: ${creds.password}`].filter(Boolean).join("\n"))}><Copy size={15} /> Copy all</Button>
            <p className="text-xs text-steel">They sign in at the normal login screen and are asked to choose their own password before anything else opens.</p>
            <Button className="w-full" onClick={() => { setCreds(null); setSheet(null); router.push("/dashboard"); }}>Done, open the property</Button>
          </>) : (<>
            <p className="text-sm text-steel">This creates the property <b>and its owner login</b>, then opens it. The owner can sign in as themselves and will see only their own property.</p>
            <Field label="Property name"><input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="Kanyakumari Bay Resort" autoFocus /></Field>
            <Field label="Type"><div className="grid grid-cols-3 gap-2">
              {([["restaurant", "Restaurant", UC], ["hotel", "Hotel", B2], ["resort", "Resort", PT]] as const).map(([v, l, I]) => (
                <button key={v} type="button" onClick={() => setNp({ ...np, type: v })} className={cn("feather feather-lift flex flex-col items-center gap-1.5 py-3 text-xs font-semibold", np.type === v && "!border-saffron shadow-glow")}><I size={18} />{l}</button>
              ))}
            </div></Field>
            <Field label="Owner's name" hint="Optional — shown in the app and on the bill"><input value={np.owner} onChange={(e) => setNp({ ...np, owner: e.target.value })} placeholder="Priya Kumar" /></Field>
            <LoginIdField value={np.email} onChange={(v) => setNp({ ...np, email: v })} name={np.name} type={np.type} ownerName={np.owner} />
            <Field label="Owner's real email *" hint="Required. Where the one-time code goes when they change their password. Not used to sign in.">
              <input value={np.contact} onChange={(e) => setNp({ ...np, contact: e.target.value })} type="email" required placeholder="owner@gmail.com" className={cn(!np.contact.trim() && np.name && "!border-[var(--color-orange)]")} />
            </Field>
            {/* sample data toggle — a proper switch instead of a bare checkbox */}
            <button type="button" onClick={() => setNp({ ...np, demo: !np.demo })}
              className={cn("w-full rounded-2xl border p-4 text-left transition-colors",
                np.demo ? "border-[var(--color-tint)] bg-[var(--color-green-2)]" : "border-[var(--color-separator)] hover:border-[var(--color-label-3)]")}>
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 shrink-0 h-5 w-9 rounded-full transition-colors relative",
                  np.demo ? "bg-[var(--color-tint)]" : "bg-[var(--color-fill-2)]")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                    np.demo ? "translate-x-4" : "translate-x-0.5")} />
                </span>
                <div className="min-w-0">
                  <div className={cn("text-sm font-semibold", np.demo && "text-[var(--color-tint)]")}>Fill it with sample data</div>
                  <div className="text-xs text-steel mt-0.5 leading-relaxed">Menu with recipes, pantry, tables, rooms, bookings, labour, printers and demo channels. Leave this off and the property opens completely empty.</div>
                </div>
              </div>
            </button>
            {err && <p className="text-sm text-chili">{err}</p>}
            <Button className="w-full" disabled={pending || !np.name || !np.contact.trim() || !!loginAddressProblem(np.email)} onClick={() => start(async () => {
              setErr(null);
              const r = await createProperty(np.name, np.type, np.demo, np.email, np.owner, np.contact);
              if ("error" in r) setErr(r.error!);
              else { setCreds({ title: `${np.name} is ready.`, email: r.login_email, password: r.temp_password, code: r.code }); setNp({ name: "", type: "resort", demo: false, email: "", owner: "", contact: "" }); }
            })}>Create property and login</Button>
          </>)}
        </div>
      </Sheet>
      <Sheet open={sheet === "password"} onClose={() => setSheet(null)} title="Change the master password">
        <div className="space-y-4">
          <p className="text-sm text-steel">The built-in master login ships as <span className="num">master@dineflow.in</span> / <span className="num">DineFlow@Master2026</span>. Change it before anyone else can reach this address.</p>
          <input type="password" placeholder="New password (10+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          {err && <p className="text-sm text-chili">{err}</p>}
          <Button className="w-full" disabled={pending || pw.length < 10} onClick={() => start(async () => { const r = await setMasterPassword(pw); if ("error" in r) setErr(r.error!); else { setPw(""); setSheet(null); alert("Password changed. Use it from your next login."); } })}>Save new password</Button>
        </div>
      </Sheet>
      <Sheet open={sheet === "key"} onClose={() => setSheet(null)} title="Issue membership key">
        <div className="space-y-4">
          <p className="text-sm text-steel">An open key can be redeemed by any property. Use the Manage button on a row to lock a key to one client.</p>
          <div className="grid grid-cols-2 gap-2"><Button disabled={pending} onClick={() => start(async () => { const r = await issueKey("monthly", null); if ("code" in r) setIssued(r.code!); else setErr(r.error!); })}>Monthly · 30 days</Button><Button disabled={pending} variant="ink" onClick={() => start(async () => { const r = await issueKey("yearly", null); if ("code" in r) setIssued(r.code!); else setErr(r.error!); })}>Yearly · 365 days</Button></div>
          {issued && <div className="feather p-4 text-center"><div className="num text-2xl tracking-[0.2em] font-semibold">{issued}</div><button className="text-xs text-steel mt-1 underline" onClick={() => navigator.clipboard.writeText(issued)}>Copy</button></div>}
          {err && <p className="text-sm text-chili">{err}</p>}
        </div>
      </Sheet>
    </div>
  );
  function setSheet(v: "tenant" | "key" | "password" | "new" | "estate" | "access" | "delete" | "detail" | null) { setSheetState(v); }
  /** open the full-record dialog for a property */
  function openDetail(t: T) {
    setSel(t); setErr(null); setDetail(null); setSheet("detail");
    start(async () => { const r = await propertyDetail(t.id); if ("error" in r) setErr(r.error!); else setDetail(r.detail); });
  }
}

/* ── Access panel: plan presets + per-module toggles ──────────────────────── */
function AccessPanel({ sel, mods, setMods, pending, err, onSave, onCancel, access }: {
  sel: T; mods: string[] | null; setMods: (v: string[] | null) => void;
  pending: boolean; err: string | null; onSave: () => void; onCancel: () => void;
  access: { id: string; enabled_modules: string[] | null }[];
}) {
  const [plan, setPlan] = useState<PlanPreset | "custom">(mods === null ? "all" : "custom");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const allowedByType = MODULES_BY_TYPE[sel.property_type];
  const all = mods === null;
  const on = (k: string) => all || (mods ?? []).includes(k) || (ALWAYS_ON as readonly string[]).includes(k);
  const count = all ? allowedByType.length : (mods ?? []).filter((k) => allowedByType.includes(k)).length + ALWAYS_ON.length;

  const toggle = (k: string) => {
    const base = all ? allowedByType.filter((x) => !(ALWAYS_ON as readonly string[]).includes(x)) : (mods ?? []);
    setMods(base.includes(k) ? base.filter((x) => x !== k) : [...base, k]);
    setPlan("custom");
  };

  const applyPlan = (p: PlanPreset) => {
    setPlan(p);
    if (p === "all" || p === "advanced") { setMods(null); return; }
    const preset = PLAN_PRESETS.find((x) => x.key === p);
    if (preset) setMods(preset.modules.filter((m) => allowedByType.includes(m)));
  };

  // filter modules by property type context
  const visibleGroups = MODULE_GROUPS.map((g) => {
    let keys = g.keys.filter((k) => allowedByType.includes(k.key));
    if (typeFilter === "restaurant") keys = keys.filter((k) => MODULES_BY_TYPE.restaurant.includes(k.key));
    else if (typeFilter === "hotel") keys = keys.filter((k) => MODULES_BY_TYPE.hotel.includes(k.key));
    else if (typeFilter === "resort") keys = keys.filter((k) => MODULES_BY_TYPE.resort.includes(k.key));
    return { ...g, keys };
  }).filter((g) => g.keys.length > 0);

  return (
    <div className="space-y-5">
      {/* plan presets */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">Plan</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PLAN_PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => applyPlan(p.key)}
              className={cn("rounded-2xl border p-3 text-left transition-all",
                plan === p.key
                  ? "border-[var(--color-tint)] bg-[var(--color-green-2)] shadow-[0_0_0_1px_var(--color-tint)]"
                  : "border-[var(--color-separator)] hover:border-[var(--color-label-3)]")}>
              <div className="flex items-center gap-2">
                <span className={cn("h-4 w-4 rounded-full border-2 grid place-items-center shrink-0 transition-colors",
                  plan === p.key ? "border-[var(--color-tint)]" : "border-[var(--color-label-3)]")}>
                  {plan === p.key && <span className="h-2 w-2 rounded-full bg-[var(--color-tint)]" />}
                </span>
                <span className={cn("text-sm font-semibold", plan === p.key && "text-[var(--color-tint)]")}>{p.label}</span>
              </div>
              <div className="text-[11px] text-steel mt-1.5 leading-snug">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* type filter + count */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-[var(--color-fill)] rounded-xl">
          {PROPERTY_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setTypeFilter(f.key)}
              className={cn("h-7 px-3 rounded-lg text-xs font-semibold transition-colors",
                typeFilter === f.key ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "text-steel hover:text-[var(--color-label)]")}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-steel ml-auto num">{count} of {allowedByType.length} on</span>
      </div>

      <p className="text-xs text-steel">Switch a module off and it leaves the menu. <b>Dashboard</b> and <b>Settings</b> are always on.</p>

      {/* module toggles */}
      {visibleGroups.map((g) => (
        <div key={g.title}>
          <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">{g.title}</div>
          <div className="rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)]">
            {g.keys.map((k) => {
              const isOn = on(k.key);
              const locked = (ALWAYS_ON as readonly string[]).includes(k.key);
              return (
                <button key={k.key} type="button" disabled={locked}
                  onClick={() => !locked && toggle(k.key)}
                  className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    !locked && "hover:bg-[var(--color-fill)]/50 cursor-pointer",
                    locked && "opacity-60 cursor-default")}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{k.label}</div>
                    <div className="text-xs text-steel mt-0.5">{k.hint}</div>
                  </div>
                  <span className={cn("shrink-0 h-6 w-11 rounded-full relative transition-colors",
                    isOn ? "bg-[var(--color-tint)]" : "bg-[var(--color-fill-2)]")}>
                    <span className={cn("absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                      isOn ? "translate-x-[22px]" : "translate-x-1")} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* actions */}
      {err && <p className="text-sm text-chili">{err}</p>}
      <div className="flex gap-2 sticky bottom-0 py-3 bg-[var(--color-bg-2)]">
        <Button className="flex-1" disabled={pending} onClick={onSave}>Save access</Button>
        <Button variant="gray" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
