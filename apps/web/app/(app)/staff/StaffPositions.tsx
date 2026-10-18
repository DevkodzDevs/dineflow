"use client";
import { useMemo, useState } from "react";
import { Crown, ConciergeBell, Sparkles, Wine, ChefHat, PartyPopper, Flower2, Waves, Wrench, ShieldCheck, Megaphone, Calculator, Users, Package, Bike, Briefcase, Search, GitBranch, Layers, ChevronDown, Home, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { DEPARTMENTS, LEVELS, ROLE_LABEL, ROLE_ACCESS, MODULE_GROUPS, MODULES_BY_TYPE, positionAccessOf, hierarchyFor, levelOf, positionByKey, departmentByKey, positionModules, type Level, type PropertyType, type Role } from "@dineflow/shared";

export type Placed = { id: string; full_name: string; role: Role; is_active: boolean; position: string | null; position_title: string | null; department: string | null; reports_to: string | null; joined_on: string | null };

/** What to call someone: their own title, the catalogue's, or their role. */
export const titleOf = (p: Placed) => p.position_title || positionByKey(p.position)?.title || ROLE_LABEL[p.role];
/** Which department they are in: as set, else the position's. */
export const deptOf = (p: Placed) => p.department || positionByKey(p.position)?.dept || null;
/** Their level on this kind of property; the owner is Leadership whether or not a position is set. */
export const levelFor = (p: Placed, type: PropertyType): Level | null => { const x = positionByKey(p.position); return x ? levelOf(x, type) : p.role === "owner" ? 1 : null; };
export const DEPT_ORDER = (key: string | null) => { const i = DEPARTMENTS.findIndex((d) => d.key === key); return i < 0 ? 99 : i; };

/** A department's colour, one of the board's hues — the same department always the same colour. */
const HUES = ["--color-green", "--color-blue", "--color-orange", "--color-violet", "--color-red"];
export const deptHue = (key: string | null) => (key ? `var(${HUES[DEPT_ORDER(key) % HUES.length]})` : "var(--color-label-3)");
/** A department's picture. */
const DEPT_ICON: Record<string, LucideIcon> = { management: Crown, front_office: ConciergeBell, housekeeping: Sparkles, service: Wine, kitchen: ChefHat, banquets: PartyPopper, spa: Flower2, recreation: Waves, engineering: Wrench, security: ShieldCheck, sales: Megaphone, finance: Calculator, hr: Users, stores: Package, delivery: Bike };
export function DeptIcon({ dept, size = 18, className }: { dept: string | null; size?: number; className?: string }) {
  const I = (dept && DEPT_ICON[dept]) || Briefcase;
  return <I size={size} className={className} aria-hidden />;
}
/** A section's name as people read it ("inventory" is the Pantry). */
const MODULE_LABEL: Record<string, string> = { dashboard: "Control room", settings: "Settings", cleaning: "Cleaning", work: "Work", ...Object.fromEntries(MODULE_GROUPS.flatMap((g) => g.keys.map((k) => [k.key, k.label]))) };
export const moduleLabel = (k: string) => MODULE_LABEL[k] ?? k;
/** Sections as small chips — what a position (or a person) opens. */
export function ModuleChips({ modules, home, className }: { modules: string[]; home?: string | null; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} data-module-chips>
      {modules.map((m) => <span key={m} className={cn("inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold", m === home ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")} title={m === home ? "Starts here after signing in" : undefined}>{m === home && <Home size={12} aria-hidden />}{moduleLabel(m)}</span>)}
    </div>
  );
}

/** Two letters from a name: "Ravi Kumar" → RK, "Murugan" → MU. */
export const initials = (n: string) => { const w = n.trim().split(/\s+/).filter(Boolean); return ((w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? "?").slice(0, 2)) || "?").toUpperCase(); };
/** A person's initials on their department's colour — a soft square, so a page of people reads by department. */
export function Avatar({ name, dept, size = 48, dot, className }: { name: string; dept: string | null; size?: number; dot?: string; className?: string }) {
  const hue = deptHue(dept);
  return (
    <span className={cn("relative shrink-0 grid place-items-center rounded-[30%] font-extrabold tracking-tight", className)} aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36, background: `color-mix(in srgb, ${hue} 20%, transparent)`, color: hue, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 32%, transparent)` }}>
      {initials(name)}
      {dot && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[var(--color-bg-2)]" style={{ background: dot }} />}
    </span>
  );
}

/**
 * The position fields, used when adding someone and in their Access sheet: department, then the positions of that
 * department from the top down (each with its level), a title of their own, who they report to, when they joined.
 */
export function PositionFields({ type, value, onChange, people, self }: {
  type: PropertyType; people: Placed[]; self?: string;
  value: { department: string; position: string; title: string; reportsTo: string; joinedOn: string };
  onChange: (v: { department: string; position: string; title: string; reportsTo: string; joinedOn: string }) => void;
}) {
  const h = useMemo(() => hierarchyFor(type), [type]);
  const dept = h.find((d) => d.key === value.department) ?? null;
  const set = (x: Partial<typeof value>) => onChange({ ...value, ...x });
  return (
    <div className="space-y-3" data-position-fields>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Department</span>
          <select className="mt-1" value={value.department} onChange={(e) => set({ department: e.target.value, position: "" })} data-dept-select>
            <option value="">Choose…</option>{h.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select></label>
        <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Position</span>
          <select className="mt-1" value={value.position} disabled={!dept} onChange={(e) => set({ position: e.target.value })} data-position-select>
            <option value="">{dept ? "Choose…" : "Choose a department first"}</option>
            {dept && LEVELS.map((l) => { const xs = dept.positions.filter((x) => x.level === l.level); return xs.length ? <optgroup key={l.level} label={`Level ${l.level} · ${l.label}`}>{xs.map((x) => <option key={x.key} value={x.key}>{x.title}</option>)}</optgroup> : null; })}
          </select></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Title of your own <span className="font-normal">(optional)</span></span>
          <input className="mt-1" value={value.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder={positionByKey(value.position)?.title ?? "e.g. Head of Tandoor"} /></label>
        <label className="block min-w-0"><span className="text-[13px] font-semibold text-steel">Joined on</span>
          <input type="date" className="mt-1" value={value.joinedOn} onChange={(e) => set({ joinedOn: e.target.value })} /></label>
      </div>
      <label className="block"><span className="text-[13px] font-semibold text-steel">Reports to</span>
        <select className="mt-1" value={value.reportsTo} onChange={(e) => set({ reportsTo: e.target.value })} data-reports-select>
          <option value="">Nobody / not set</option>
          {people.filter((x) => x.id !== self && x.is_active).sort((a, b) => (levelFor(a, type) ?? 9) - (levelFor(b, type) ?? 9)).map((x) => <option key={x.id} value={x.id}>{x.full_name} — {titleOf(x)}</option>)}
        </select></label>
    </div>
  );
}

/** One person on the chart: their initials in the department's colour, name, title, department. */
function ChartCard({ p, type, lead }: { p: Placed; type: PropertyType; lead?: boolean }) {
  const d = departmentByKey(deptOf(p)); const lv = levelFor(p, type);
  return (
    <div className={cn("relative min-w-0 rounded-[20px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] px-3.5 py-3 flex items-center gap-3 shadow-[0_1px_0_rgb(0_0_0/0.04)]", lead && "ring-2 ring-[color-mix(in_srgb,var(--color-orange)_45%,transparent)]")} data-chart-person={p.full_name}>
      <Avatar name={p.full_name} dept={deptOf(p)} size={42} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">{lead && <Crown size={14} className="shrink-0 text-[var(--color-orange)]" aria-hidden />}<span className="font-extrabold text-[14.5px] truncate">{p.full_name}</span></div>
        <div className="text-[13px] truncate">{titleOf(p)}</div>
        <div className="text-[11.5px] text-steel truncate flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: deptHue(deptOf(p)) }} />{d?.label ?? "No department"}{lv ? ` · L${lv}` : ""}</div>
      </div>
    </div>
  );
}

/**
 * The team as a chart. Two ways to read it: *Reporting lines* — a tree from the people nobody is set above, each
 * person's team indented under them with connector lines — and *By level* — a ladder from Leadership (1) down to
 * Trainee (7), a node per level on a rail. It opens on reporting lines when anyone has a manager set, else on the
 * ladder. People with no position yet are gathered at the foot, to be placed.
 */
export function TeamChart({ type, people }: { type: PropertyType; people: Placed[] }) {
  const live = people.filter((p) => p.is_active);
  const anyLines = live.some((p) => p.reports_to && live.some((x) => x.id === p.reports_to));
  const [mode, setMode] = useState<"tree" | "ladder">(anyLines ? "tree" : "ladder");
  const kids = (id: string) => live.filter((p) => p.reports_to === id).sort((a, b) => (levelFor(a, type) ?? 9) - (levelFor(b, type) ?? 9) || a.full_name.localeCompare(b.full_name));
  const roots = live.filter((p) => !p.reports_to || !live.some((x) => x.id === p.reports_to)).sort((a, b) => (levelFor(a, type) ?? 9) - (levelFor(b, type) ?? 9) || DEPT_ORDER(deptOf(a)) - DEPT_ORDER(deptOf(b)));
  const bands = LEVELS.map((l) => ({ ...l, people: live.filter((p) => levelFor(p, type) === l.level).sort((a, b) => DEPT_ORDER(deptOf(a)) - DEPT_ORDER(deptOf(b)) || a.full_name.localeCompare(b.full_name)) }));
  const unplaced = live.filter((p) => levelFor(p, type) === null);

  const Node = ({ p, depth }: { p: Placed; depth: number }) => {
    const ks = depth < 12 ? kids(p.id) : [];
    return (
      <li className="relative">
        <ChartCard p={p} type={type} lead={levelFor(p, type) === 1} />
        {ks.length > 0 && (
          <ul className="mt-2.5 ml-5 sm:ml-7 pl-4 sm:pl-6 border-l-2 border-[var(--color-separator)] space-y-2.5">
            {ks.map((k) => <div key={k.id} className="relative before:absolute before:-left-4 sm:before:-left-6 before:top-7 before:w-4 sm:before:w-6 before:border-t-2 before:border-[var(--color-separator)]"><Node p={k} depth={depth + 1} /></div>)}
          </ul>)}
      </li>
    );
  };

  return (
    <div className="space-y-4" data-team-chart>
      <div className="inline-grid grid-cols-2 rounded-full bg-[var(--color-fill)] p-1" role="group" aria-label="Chart">
        {([["tree", "Reporting lines", GitBranch], ["ladder", "By level", Layers]] as const).map(([k, label, I]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} data-chart-mode={k}
            className={cn("!min-h-11 rounded-full px-4 inline-flex items-center justify-center gap-2 text-[13.5px] font-bold transition-colors", mode === k ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-[0_1px_3px_rgb(0_0_0/0.18)]" : "text-steel hover:text-[var(--color-label)]")}><I size={15} aria-hidden />{label}</button>))}
      </div>

      {mode === "tree" ? (
        <div className="rounded-[26px] border border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_45%,transparent)] p-4 sm:p-6" data-chart-tree>
          {!anyLines && <p className="text-[13px] text-steel mb-3">Nobody has a manager set yet — choose who each person reports to under Access, and the tree draws itself.</p>}
          <ul className="space-y-3 max-w-xl">{roots.filter((p) => levelFor(p, type) !== null || kids(p.id).length).map((p) => <Node key={p.id} p={p} depth={0} />)}</ul>
        </div>
      ) : (
        <ol className="relative space-y-3" data-chart-ladder>
          <span className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-[var(--color-separator)]" aria-hidden />
          {bands.filter((b) => b.people.length).map((b) => (
            <li key={b.level} className="relative pl-14" data-level={b.level}>
              <span className={cn("absolute left-0 top-1 h-10 w-10 rounded-full grid place-items-center text-[15px] font-black num border-4 border-[var(--color-bg)]", b.level <= 2 ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill-2)]")}>{b.level}</span>
              <div className="flex flex-wrap items-baseline gap-x-2 pt-2 mb-2.5"><span className="text-[16px] font-extrabold">{b.label}</span><span className="text-[12.5px] text-steel">{b.hint}</span><span className="num text-[12.5px] text-steel">· {b.people.length}</span></div>
              <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))]">{b.people.map((p) => <ChartCard key={p.id} p={p} type={type} lead={b.level === 1} />)}</div>
            </li>))}
        </ol>
      )}

      {unplaced.length > 0 && <section className="rounded-[22px] border-2 border-dashed border-[var(--color-separator)] p-4" data-unplaced>
        <div className="text-[15px] font-extrabold">Not placed yet · <span className="num">{unplaced.length}</span></div>
        <p className="text-[12.5px] text-steel mb-3">Give them a position under Access, and they take their place in the chart.</p>
        <div className="flex flex-wrap gap-2">{unplaced.map((p) => <span key={p.id} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-fill)] pl-1 pr-3 py-1 text-[13px] font-semibold"><Avatar name={p.full_name} dept={null} size={26} />{p.full_name} <span className="text-steel font-normal">· {ROLE_LABEL[p.role]}</span></span>)}</div>
      </section>}
      {live.length === 0 && <p className="text-sm text-steel">Nobody yet.</p>}
    </div>
  );
}

/**
 * The full ladder for this kind of property, department by department, top to bottom — the positions a place like
 * this usually has, who holds each here, and the access each suggests. Search a title; show one level.
 */
export function PositionsGuide({ type, people }: { type: PropertyType; people: Placed[] }) {
  const h = useMemo(() => hierarchyFor(type), [type]);
  const [q, setQ] = useState(""); const [lv, setLv] = useState<Level | null>(null); const [openKey, setOpenKey] = useState<string | null>(null);
  /** what a position opens here: its own list, or (managers, owners) everything its role may have on this kind of property */
  const opens = (key: string, role: Role) => positionModules(key, type, MODULES_BY_TYPE) ?? ROLE_ACCESS[role].filter((m) => MODULES_BY_TYPE[type].includes(m) && m !== "dashboard");
  const holders = (key: string) => people.filter((p) => p.is_active && p.position === key);
  const total = h.reduce((a, d) => a + d.positions.length, 0);
  const needle = q.trim().toLowerCase();
  const view = h.map((d) => ({ ...d, list: d.positions.filter((x) => (lv === null || x.level === lv) && (!needle || x.title.toLowerCase().includes(needle) || d.label.toLowerCase().includes(needle))) })).filter((d) => d.list.length);
  return (
    <div className="space-y-4" data-positions-guide>
      <div className="flex flex-col gap-3">
        <div className="relative w-full sm:max-w-md min-w-0"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-steel pointer-events-none" aria-hidden />
          <input className="!h-12 !rounded-full !pl-11" placeholder="Find a position — chef, captain, manager…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a position" data-guide-search /></div>
        <div className="rail-fade flex gap-1.5 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:![mask-image:none] [scrollbar-width:none]" role="group" aria-label="Level">
          {[null, ...LEVELS.map((l) => l.level)].map((l) => (
            <button key={l ?? "all"} type="button" aria-pressed={lv === l} onClick={() => setLv(l as Level | null)} className={cn("shrink-0 !min-h-11 rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap", lv === l ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
              {l === null ? "All levels" : <><span className="num">{l}</span> · {LEVELS[(l as number) - 1].label}</>}</button>))}
        </div>
      </div>
      <p className="text-[13px] text-steel">{total} positions in {h.length} departments — the usual structure for a {type}, from the top down. Titles vary; give anyone a title of their own. The access shown is only a suggestion.</p>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3 items-start">
        {view.map((d) => { const filled = d.positions.filter((x) => holders(x.key).length).length; const hue = deptHue(d.key); return (
          <section key={d.key} className="min-w-0 rounded-[24px] bg-[var(--color-bg-2)] border border-[var(--color-separator)] overflow-hidden" data-guide-dept={d.key}>
            <header className="flex items-center gap-3 px-4 py-3.5" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${hue} 16%, transparent), transparent 70%)` }}>
              <span className="h-11 w-11 shrink-0 rounded-[14px] grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 22%, transparent)`, color: hue }}><DeptIcon dept={d.key} size={20} /></span>
              <div className="min-w-0 flex-1"><div className="text-[16px] font-extrabold truncate">{d.label}</div><div className="text-[12px] text-steel">{d.positions.length} positions · <span className="num">{filled}</span> filled here</div></div>
            </header>
            <ol className="relative px-4 pb-3 pt-1">
              <span className="absolute left-[31px] top-3 bottom-5 w-0.5 bg-[var(--color-separator)]" aria-hidden />
              {d.list.map((x) => { const hs = holders(x.key); const isOpen = openKey === x.key; const mods = opens(x.key, x.role); const home = positionAccessOf(x.key)?.home ?? null; return (
                <li key={x.key} className="relative min-w-0" data-guide-position={x.key}>
                <button type="button" onClick={() => setOpenKey(isOpen ? null : x.key)} aria-expanded={isOpen} className="w-full !min-h-12 flex items-center gap-3 py-1.5 text-left rounded-xl hover:bg-[color-mix(in_srgb,var(--color-fill)_60%,transparent)] min-w-0" data-guide-toggle>
                  <span className={cn("relative z-[1] h-[30px] w-[30px] shrink-0 rounded-full grid place-items-center text-[12.5px] font-black num border-[3px] border-[var(--color-bg-2)]", hs.length ? "" : x.level <= 2 ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill-2)]")}
                    style={hs.length ? { background: hue, color: "var(--color-bezel)" } : undefined} title={LEVELS[x.level - 1].label}>{x.level}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold leading-tight truncate">{x.title}</span><span className="block text-[11.5px] text-steel truncate">{ROLE_LABEL[x.role]} · opens {positionAccessOf(x.key)?.open === null ? "everything" : `${mods.length} section${mods.length === 1 ? "" : "s"}`}</span></span>
                  {hs.length > 0 && <span className="shrink-0 flex items-center" title={hs.map((p) => p.full_name).join(", ")} data-holders>
                    {hs.slice(0, 3).map((p, i) => <Avatar key={p.id} name={p.full_name} dept={d.key} size={26} className={cn("ring-2 ring-[var(--color-bg-2)]", i > 0 && "-ml-2")} />)}
                    {hs.length > 3 && <span className="-ml-2 h-[26px] min-w-[26px] px-1 rounded-full grid place-items-center text-[10.5px] font-bold bg-[var(--color-fill-2)] ring-2 ring-[var(--color-bg-2)]">+{hs.length - 3}</span>}
                  </span>}
                  <ChevronDown size={16} className={cn("shrink-0 text-steel transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen && <div className="ml-[42px] mb-2 mt-0.5 rounded-2xl bg-[var(--color-fill)] p-3" data-guide-detail>
                  <div className="text-[12px] font-bold text-steel mb-1.5">Opens{home ? " · starts on the one with the house" : ""}</div>
                  <ModuleChips modules={[...(x.role === "owner" ? ["dashboard"] : []), ...mods, ...(home && !mods.includes(home) && home !== "dashboard" ? [home] : [])]} home={home} />
                  <div className="text-[11.5px] text-steel mt-2">{LEVELS[x.level - 1].label} · {LEVELS[x.level - 1].hint}. Suggested access: {ROLE_LABEL[x.role]}.</div>
                </div>}
                </li>); })}
            </ol>
          </section>); })}
      </div>
      {view.length === 0 && <p className="text-sm text-steel">No position matches “{q}”.</p>}
    </div>
  );
}
