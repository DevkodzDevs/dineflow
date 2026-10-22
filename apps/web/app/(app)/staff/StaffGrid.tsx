"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Layers } from "lucide-react";
import { ROLES, ROLE_LABEL, LEVELS, departmentByKey, type PropertyType } from "@dineflow/shared";
import { cn } from "@/components/ui";
import { Avatar, DeptIcon, titleOf, deptOf, levelFor, DEPT_ORDER, deptHue, type Placed } from "./StaffPositions";

/**
 * The staff list as a data grid (2026-10-22, the owner: "show a datagrid; a row opens that person; the job-based list in the
 * grid too; don't disturb the card design"). It is the second layout of the People view — the cards are untouched — and
 * the default from an iPad up (StaffClient picks it with CSS, so the first paint is right on every width).
 *
 * Grouped by job: a band per department (its icon on its colour, how many), people under it by level then name; "Group by
 * job" off gives one list. Every column but the trailing chevron sorts. Columns come in with the room the grid itself has
 * (container queries, not the screen — a sidebar takes 256px from a laptop): name and state always; department from 36rem;
 * level and phone from 46; access from 58; staff code and email from 78; joined and reports-to from 90. A row is one tap
 * target (and Enter / Space) and opens the person; the phone in it calls without opening.
 */
export type GridPerson = Placed & { email: string | null; phone: string | null; contact_email: string | null; contact_verified_at: string | null; staff_code: string | null; must_change_password: boolean; allowed_modules: string[] | null };
export type Duty = { profile_id: string; in_at: string | null; out_at: string | null };
type Key = "name" | "dept" | "level" | "access" | "phone" | "code" | "email" | "joined" | "boss" | "state";

/** what the grid shows from each width of itself (Tailwind container queries on the wrapper) */
const AT: Partial<Record<Key, string>> = {
  dept: "hidden @[36rem]:table-cell", level: "hidden @[46rem]:table-cell", phone: "hidden @[46rem]:table-cell",
  access: "hidden @[58rem]:table-cell", code: "hidden @[78rem]:table-cell", email: "hidden @[78rem]:table-cell",
  joined: "hidden @[90rem]:table-cell", boss: "hidden @[90rem]:table-cell",
};
const COLS: { key: Key; label: string; num?: boolean }[] = [
  { key: "name", label: "Name" }, { key: "dept", label: "Department" }, { key: "level", label: "Level" }, { key: "access", label: "Access" },
  { key: "phone", label: "Phone", num: true }, { key: "code", label: "Staff code", num: true }, { key: "email", label: "Email" },
  { key: "joined", label: "Joined", num: true }, { key: "boss", label: "Reports to" }, { key: "state", label: "Today" },
];
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export function StaffGrid<P extends GridPerson>({ people, everyone, type, me, duty, howOf, phoneOut, onOpen }: {
  people: P[]; everyone: P[]; type: PropertyType; me: string; duty: Duty[];
  howOf: (p: P) => string | null; phoneOut: (raw: string) => string; onOpen: (p: P) => void;
}) {
  const [group, setGroup] = useState(true);
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 } | null>(null);
  const dutyOf = useMemo(() => new Map(duty.map((d) => [d.profile_id, d])), [duty]);
  const nameOf = useMemo(() => new Map(everyone.map((p) => [p.id, p.full_name])), [everyone]);

  /** the state a row shows, worst first: switched off, not signed in yet, then today's attendance */
  const state = (p: P): { word: string; tint: string; rank: number } => {
    if (!p.is_active) return { word: "Off", tint: "var(--color-red)", rank: 0 };
    if (p.must_change_password) return { word: "Not signed in", tint: "var(--color-orange)", rank: 1 };
    const d = dutyOf.get(p.id);
    if (d?.in_at && !d.out_at) return { word: `On duty · ${hm(d.in_at)}`, tint: "var(--color-green)", rank: 4 };
    if (d?.in_at && d.out_at) return { word: `Left · ${hm(d.out_at)}`, tint: "var(--color-blue)", rank: 3 };
    return { word: "Not in today", tint: "var(--color-label-3)", rank: 2 };
  };
  const by: Record<Key, (a: P, b: P) => number> = {
    name: (a, b) => a.full_name.localeCompare(b.full_name),
    dept: (a, b) => DEPT_ORDER(deptOf(a)) - DEPT_ORDER(deptOf(b)),
    level: (a, b) => (levelFor(a, type) ?? 9) - (levelFor(b, type) ?? 9),
    access: (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role),
    phone: (a, b) => (a.phone ?? "~").localeCompare(b.phone ?? "~"),
    code: (a, b) => (a.staff_code ?? "~").localeCompare(b.staff_code ?? "~", undefined, { numeric: true }),
    email: (a, b) => Number(!!b.contact_verified_at) - Number(!!a.contact_verified_at) || Number(!!b.contact_email) - Number(!!a.contact_email),
    joined: (a, b) => (a.joined_on ?? "9999").localeCompare(b.joined_on ?? "9999"),
    boss: (a, b) => (nameOf.get(a.reports_to ?? "") ?? "~").localeCompare(nameOf.get(b.reports_to ?? "") ?? "~"),
    state: (a, b) => state(a).rank - state(b).rank,
  };
  // the people's own order (department, level, name) unless a column is sorted
  const order = (list: P[]) => (sort ? [...list].sort((a, b) => by[sort.key](a, b) * sort.dir || by.level(a, b) || by.name(a, b)) : list);
  const groups = useMemo(() => {
    if (!group) return [{ key: "all", label: "", rows: order(people) }];
    const m = new Map<string, P[]>();
    for (const p of people) { const k = deptOf(p) ?? "none"; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()].sort((a, b) => DEPT_ORDER(a[0] === "none" ? null : a[0]) - DEPT_ORDER(b[0] === "none" ? null : b[0]))
      .map(([key, rows]) => ({ key, label: key === "none" ? "No position yet" : departmentByKey(key)?.label ?? key, rows: order(rows) }));
  }, [people, group, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (k: Key) => setSort((s) => (!s || s.key !== k ? { key: k, dir: 1 } : s.dir === 1 ? { key: k, dir: -1 } : null));

  const cell = (k: Key, extra?: string) => cn("px-3.5 py-2.5 align-middle border-b border-[var(--color-separator)]", AT[k], extra);
  const td = (p: P, k: Key): ReactNode => {
    const d = deptOf(p), lv = levelFor(p, type), hue = deptHue(d);
    switch (k) {
      case "name": return (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={p.full_name} dept={d} size={38} dot={!p.is_active ? "var(--color-red)" : p.must_change_password ? "var(--color-orange)" : "var(--color-green)"} />
          <div className="min-w-0">
            <div className={cn("text-[14.5px] font-extrabold leading-tight truncate", !p.is_active && "line-through text-steel")}>{p.full_name}{p.id === me && <span className="text-[12px] text-steel font-semibold"> · you</span>}</div>
            <div className="text-[12.5px] text-[var(--color-label-2)] truncate mt-0.5">{titleOf(p)}</div>
          </div>
        </div>);
      case "dept": return departmentByKey(d)
        ? <span className="inline-flex items-center gap-2 min-w-0 text-[13px] font-semibold"><span className="h-7 w-7 shrink-0 rounded-full grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 18%, transparent)`, color: hue }}><DeptIcon dept={d} size={14} /></span><span className="truncate">{departmentByKey(d)!.label}</span></span>
        : <span className="text-[13px] text-steel">—</span>;
      case "level": return lv ? <span className="inline-grid place-items-center h-7 px-2 rounded-full text-[12px] font-black num bg-[var(--color-fill)]" title={`Level ${lv} · ${LEVELS[lv - 1].label}`}>L{lv}</span> : <span className="text-steel">—</span>;
      case "access": { const how = howOf(p); return (
        <div className="min-w-0 leading-tight"><div className="text-[13px] font-bold truncate">{ROLE_LABEL[p.role]}</div>{how && <div className="text-[11.5px] text-[var(--color-label-2)] truncate mt-0.5">{how}</div>}</div>); }
      case "phone": return p.phone
        ? <a href={`tel:${p.phone.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} className="num text-[13px] font-semibold hover:text-[var(--color-tint)] whitespace-nowrap" aria-label={`Call ${p.full_name}`}>{phoneOut(p.phone)}</a>
        : <span className="text-steel">—</span>;
      case "code": return <span className="num text-[13px]">{p.staff_code ?? "—"}</span>;
      case "email": return !p.contact_email ? <span className="text-steel text-[13px]">—</span>
        : <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap" title={p.contact_email}><span className="h-2 w-2 rounded-full" style={{ background: p.contact_verified_at ? "var(--color-green)" : "var(--color-orange)" }} aria-hidden />{p.contact_verified_at ? "Verified" : "Not verified"}</span>;
      case "joined": return <span className="num text-[13px] whitespace-nowrap">{p.joined_on ? new Date(p.joined_on + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "—"}</span>;
      case "boss": return <span className="text-[13px] truncate block max-w-[12rem]">{nameOf.get(p.reports_to ?? "") ?? "—"}</span>;
      case "state": { const s = state(p); return <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.tint }} aria-hidden />{s.word}</span>; }
    }
  };

  return (
    <div className="rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-staff-grid>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--color-separator)]">
        <span className="text-[13px] font-bold text-steel flex-1 min-w-0 truncate">{people.length} {people.length === 1 ? "person" : "people"}{group && groups.length > 1 ? ` · ${groups.length} departments` : ""}</span>
        <button type="button" onClick={() => setGroup((g) => !g)} aria-pressed={group} data-staff-group-toggle
          className={cn("shrink-0 !min-h-10 h-10 px-3.5 rounded-full inline-flex items-center gap-2 text-[13px] font-bold border transition-colors", group ? "bg-[var(--color-label)] text-[var(--color-on-label)] border-transparent" : "bg-[var(--color-bg-2)] border-[var(--color-separator)] hover:bg-[var(--color-fill)]")}>
          <Layers size={15} aria-hidden />Group by job</button>
      </div>
      <div className="@container overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left" aria-label="Staff">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3.5 py-0 h-11 bg-[color-mix(in_srgb,var(--color-bg-2)_92%,var(--color-bg-3))] border-b border-[var(--color-separator)] whitespace-nowrap", AT[c.key])}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button type="button" onClick={() => flip(c.key)} className="!min-h-0 h-11 inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-[var(--color-label-2)] hover:text-[var(--color-label)]" data-sort={c.key}>
                    {c.label}{sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />) : <ArrowUpDown size={13} className="opacity-40" aria-hidden />}</button>
                </th>))}
              <th className="w-10 bg-[color-mix(in_srgb,var(--color-bg-2)_92%,var(--color-bg-3))] border-b border-[var(--color-separator)]" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (<GroupRows key={g.key}>
              {group && (
                <tr data-staff-group={g.key}>
                  <th scope="colgroup" colSpan={COLS.length + 1} className="px-3.5 py-2 text-left bg-[var(--color-fill)] border-b border-[var(--color-separator)]">
                    <span className="inline-flex items-center gap-2 text-[12.5px] font-extrabold">
                      <span className="h-6 w-6 rounded-full grid place-items-center" style={g.key === "none" ? { background: "var(--color-bg-2)" } : { background: `color-mix(in srgb, ${deptHue(g.key)} 22%, transparent)`, color: deptHue(g.key) }}><DeptIcon dept={g.key === "none" ? null : g.key} size={13} /></span>
                      {g.label}<span className="num h-5 min-w-5 px-1.5 rounded-full grid place-items-center text-[11px] bg-[var(--color-bg-2)] text-[var(--color-label-2)]">{g.rows.length}</span>
                    </span>
                  </th>
                </tr>)}
              {g.rows.map((p) => (
                <tr key={p.id} tabIndex={0} data-staff-row={p.id} aria-label={`${p.full_name}, ${titleOf(p)} — open`}
                  onClick={() => onOpen(p)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p); } }}
                  className={cn("cursor-pointer transition-colors hover:bg-[var(--color-fill)] focus-visible:outline-2 focus-visible:outline-[var(--color-tint)] focus-visible:-outline-offset-2", !p.is_active && "opacity-70")}>
                  {COLS.map((c) => <td key={c.key} className={cell(c.key, c.key === "name" ? "min-w-[13rem] max-w-[20rem]" : undefined)}>{td(p, c.key)}</td>)}
                  <td className={cell("name", "w-10 pr-3 text-[var(--color-label-3)]")}><ChevronRight size={17} aria-hidden /></td>
                </tr>))}
            </GroupRows>))}
            {people.length === 0 && <tr><td colSpan={COLS.length + 1} className="p-8 text-center text-sm text-steel">Nobody found. Try another name.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const GroupRows = ({ children }: { children: ReactNode }) => <>{children}</>;
