"use client";
import { useState, useTransition } from "react";
import { Check, Sunrise, Moon, Clock3, Pencil, Plus, Sparkles, Users, Briefcase, BadgeCheck } from "lucide-react";
import { Card, Empty, Sheet, cn, useToast, FlapPercent } from "@/components/ui";
import { tick, saveList } from "./actions";
import { Say } from "@/components/ui/Say";
import { DeptIcon, deptHue } from "../staff/StaffPositions";

export type List = { id: string; name: string; shift: "opening" | "closing" | "anytime"; items: string[]; is_active: boolean; sort_order: number; departments?: string[] | null; jobs?: string[] | null; positions?: string[] | null };
export type Run = { checklist_id: string; run_date: string; done: Record<string, { name: string; at: string }>; completed_at: string | null };
/** A team, job or position a list can be for, with how many people are in it (`team`: a position's team, for its colour). */
export type Choice = { key: string; label: string; people: number; team?: string };
/** One person, without a name: their team, job (role) and position. */
export type Who = { d: string | null; j: string; p: string | null };
type Kind = "d" | "j" | "p";

const SHIFT = { opening: { label: "Opening", w: "opening", Icon: Sunrise }, closing: { label: "Closing", w: "closing", Icon: Moon }, anytime: { label: "Any time", w: "any_time", Icon: Clock3 } } as const;
/** Two lists most kitchens in India start from; the owner edits them to fit. */
const STARTERS: { name: string; shift: List["shift"]; items: string[] }[] = [
  { name: "Opening", shift: "opening", items: ["Gas and burners checked", "Fridge and freezer temperatures noted", "Floor and tables cleaned", "Hand-wash soap and towels stocked", "Cash float counted", "Today's specials told to the floor", "Sold-out dishes switched off on the menu"] },
  { name: "Closing", shift: "closing", items: ["Gas valves shut", "Leftovers labelled and stored", "Kitchen and floor washed", "Garbage taken out", "Cash counted and shift closed", "Lights, fans and AC off", "Doors and shutters locked"] },
];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
/** Who a list is for, as tags: "d:kitchen" a team, "j:waiter" a job, "p:captain" a position (0122, 0123). None = everyone. */
const tagsOf = (l: List) => [...(l.departments ?? []).map((k) => `d:${k}`), ...(l.jobs ?? []).map((k) => `j:${k}`), ...(l.positions ?? []).map((k) => `p:${k}`)];
const keysOf = (tags: string[], kind: Kind) => tags.filter((t) => t.startsWith(`${kind}:`)).map((t) => t.slice(2));
/** The database's rule (_checklist_for_me): a list is for someone whose team, job or position it names. */
const reaches = (tags: string[], w: Who) => tags.some((t) => { const k = t.slice(2); return t[0] === "d" ? w.d === k : t[0] === "j" ? w.j === k : w.p === k; });
const plural = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

type Look = { label: (t: string) => string; hue: (t: string) => string };
/** A tag's picture: a team's own, a briefcase for a job, a badge for a position. */
function TagIcon({ tag, size }: { tag: string; size: number }) {
  return tag[0] === "d" ? <DeptIcon dept={tag.slice(2)} size={size} className="shrink-0" /> : tag[0] === "j" ? <Briefcase size={size} className="shrink-0" aria-hidden /> : <BadgeCheck size={size} className="shrink-0" aria-hidden />;
}
/** Who a list is for, as small chips: "Everyone", or each team, job and position in its own colour. */
function ForWhom({ tags, look }: { tags: string[]; look: Look }) {
  if (!tags.length) return <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[var(--color-fill)] text-[12.5px] font-bold text-steel" data-for="everyone"><Users size={13} aria-hidden />Everyone</span>;
  return (
    <span className="inline-flex flex-wrap gap-1.5 min-w-0" data-for={tags.join(",")}>
      {tags.map((t) => { const hue = look.hue(t); return (
        <span key={t} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12.5px] font-bold max-w-full"
          style={{ background: `color-mix(in srgb, ${hue} 16%, transparent)`, color: `color-mix(in srgb, ${hue} 78%, var(--color-label))` }}>
          <TagIcon tag={t} size={13} /><span className="truncate">{look.label(t)}</span></span>); })}
    </span>);
}

/**
 * One card per list: who it is for, a progress bar, then each duty as a 56px row — a tap ticks it with your name and
 * the time, a second tap unticks it. Under the card, the last seven days as dots (green done, amber part, grey
 * nothing). A person is handed only the lists for everyone and for their own team, job or position (0122, 0123, RLS);
 * owners, managers and supervisors see every list, can look at the lists for one team, job or position at a time, and get
 * Edit and New list.
 */
export function TasksClient({ lists, runs, today, editor, teams, jobs, positions, people, me }: { lists: List[]; runs: Run[]; today: string; editor: boolean; teams: Choice[]; jobs: Choice[]; positions: Choice[]; people: Who[]; me: Who }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [mine, setMine] = useState<Record<string, Run["done"]>>({});   // today's ticks as this screen knows them
  const [edit, setEdit] = useState<List | "new" | null>(null);
  const [view, setView] = useState<string>("all");   // the editor's filter: all · everyone · a tag
  const look = lookFor(teams, jobs, positions);
  const active = lists.filter((l) => l.is_active);
  const used = [...new Set(active.flatMap(tagsOf))].sort((a, b) => "djp".indexOf(a[0]) - "djp".indexOf(b[0]) || look.label(a).localeCompare(look.label(b)));
  const shown = view === "all" ? active : view === "everyone" ? active.filter((l) => !tagsOf(l).length) : active.filter((l) => tagsOf(l).includes(view));
  // the person's own team, job and position, as far as the choices know them
  const myTags = [me.d ? `d:${me.d}` : null, `j:${me.j}`, me.p ? `p:${me.p}` : null].filter((t): t is string => !!t && known(t, teams, jobs, positions));
  const doneOf = (l: List) => mine[l.id] ?? runs.find((r) => r.checklist_id === l.id && r.run_date === today)?.done ?? {};
  const week = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(today) - (6 - i) * 86400000).toISOString().slice(0, 10));

  const toggle = (l: List, i: number) => {
    const was = doneOf(l); const on = !was[String(i)];
    setMine((m) => ({ ...m, [l.id]: on ? { ...was, [String(i)]: { name: "You", at: new Date().toISOString() } } : Object.fromEntries(Object.entries(was).filter(([k]) => k !== String(i))) }));
    start(async () => {
      const r = await tick(l.id, i, on);
      if ("error" in r) { toast(r.error!, "err"); setMine((m) => ({ ...m, [l.id]: was })); return; }
      setMine((m) => ({ ...m, [l.id]: r.run.done }));
      if (r.run.completed_at && on) toast(`${l.name} — all done`);
    });
  };
  const starters = () => start(async () => {
    for (const s of STARTERS) { const r = await saveList(null, s.name, s.shift, s.items); if ("error" in r) { toast(r.error!, "err"); return; } }
    toast("Opening and Closing lists added");
  });

  return (
    <div className="space-y-5">
      {editor && <div className="flex flex-wrap gap-2">
        <button type="button" className="svc-btn go sm !px-5" onClick={() => setEdit("new")} data-new-list><Plus size={18} aria-hidden /><Say w="new_list" /></button>
        {lists.length === 0 && <button type="button" disabled={pending} className="svc-btn quiet sm !px-5" onClick={starters} data-starter-lists><Sparkles size={18} aria-hidden /> Start with Opening & Closing</button>}
      </div>}

      {/* whose lists these are: the editor can look at one team's; anyone else is told which they are seeing */}
      {editor && used.length > 0 && (
        <div className="chip-rail -mx-1 px-1 pb-1 overflow-x-auto" role="group" aria-label="Show the lists for" data-list-filter>
          {[{ key: "all", label: "All lists" }, { key: "everyone", label: "Everyone" }, ...used.map((t) => ({ key: t, label: look.label(t) }))].map((d) => (
            <button key={d.key} type="button" className={cn("chip", view === d.key && "on")} aria-pressed={view === d.key} onClick={() => setView(d.key)} data-view={d.key}>
              {d.key === "all" ? null : d.key === "everyone" ? <Users size={15} aria-hidden /> : <TagIcon tag={d.key} size={15} />}{d.label}
            </button>))}
        </div>)}
      {!editor && active.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] text-steel" data-my-lists>
          Your lists — the ones for everyone{myTags.length ? <> and for <ForWhom tags={myTags} look={look} /></> : "."}
        </p>)}

      {active.length === 0 ? <Empty title="No checklists yet" hint={editor ? "Add ready-made Opening and Closing lists, then edit them." : "Nothing for your job yet. Ask your manager to add lists."} /> : shown.length === 0 ? <Empty title="No lists for this choice" hint="Pick another above, or tap New list." /> : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" data-lists>
          {shown.map((l) => {
            const done = doneOf(l); const n = Object.keys(done).length; const all = n >= l.items.length; const { label, Icon } = SHIFT[l.shift];
            return (
              <Card key={l.id} className="min-w-0 !p-0 overflow-hidden" data-list={l.name}>
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("h-10 w-10 shrink-0 rounded-xl grid place-items-center", all ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)]")}>{all ? <Check size={20} strokeWidth={3} aria-hidden /> : <Icon size={19} aria-hidden />}</span>
                    <div className="min-w-0 flex-1"><div className="text-[17px] font-extrabold truncate">{l.name}</div><div className="text-[12.5px] text-steel">{label} · <span className="num" data-progress>{n}/{l.items.length}</span>{all ? " · all done" : ""}</div></div>
                    {/* 2026-10-20: how far along, counted up on flap tiles when a duty is ticked (Flap.tsx) */}
                    <span className="shrink-0" data-list-pct><FlapPercent value={(n / Math.max(1, l.items.length)) * 100} size="xs" tile="34px" bare bar={false} say={`${n} of ${l.items.length} done`} /></span>
                    {editor && <button type="button" onClick={() => setEdit(l)} className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-steel hover:bg-[var(--color-fill)]" aria-label={`Edit ${l.name}`}><Pencil size={17} /></button>}
                  </div>
                  <div className="mt-2.5 min-w-0"><ForWhom tags={tagsOf(l)} look={look} /></div>
                  <div className="mt-3 h-2 rounded-full bg-[var(--color-fill)] overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${(n / Math.max(1, l.items.length)) * 100}%`, background: all ? "var(--color-green)" : "var(--color-orange)" }} /></div>
                </div>
                <ul className="border-t border-[var(--color-separator)]">
                  {l.items.map((it, i) => { const d = done[String(i)]; return (
                    <li key={i}><button type="button" onClick={() => toggle(l, i)} aria-pressed={!!d} data-duty
                      className="!min-h-14 w-full flex items-center gap-3 px-4 py-2 text-left border-b border-[var(--color-separator)] last:border-b-0 hover:bg-[var(--color-fill)]">
                      <span className={cn("h-7 w-7 shrink-0 rounded-lg grid place-items-center border-2 transition-colors", d ? "bg-[var(--color-green)] border-[var(--color-green)] text-[var(--color-bezel)]" : "border-[var(--color-label-3)]")}>{d && <Check size={16} strokeWidth={3.5} aria-hidden />}</span>
                      <span className="min-w-0 flex-1"><span className={cn("block text-[15px] font-semibold leading-snug", d && "text-steel line-through decoration-2")}>{it}</span>
                        {d && <span className="block text-[12px] text-steel">{d.name} · {hhmm(d.at)}</span>}</span>
                    </button></li>); })}
                </ul>
                <div className="px-4 py-3 flex items-center gap-2 border-t border-[var(--color-separator)]" aria-label="The last seven days">
                  <span className="text-[12px] font-bold text-steel mr-1">Week</span>
                  {week.map((d) => { const r = runs.find((x) => x.checklist_id === l.id && x.run_date === d); const k = d === today ? n : r ? Object.keys(r.done).length : 0; const full = k >= l.items.length;
                    return <span key={d} title={`${d}: ${k}/${l.items.length}`} className={cn("h-3 w-3 rounded-full", full ? "bg-[var(--color-green)]" : k > 0 ? "bg-[var(--color-orange)]" : "bg-[var(--color-fill-2)]", d === today && "ring-2 ring-offset-2 ring-offset-[var(--color-bg-2)] ring-[var(--color-label-3)]")} />; })}
                </div>
              </Card>);
          })}
        </div>)}

      {editor && lists.some((l) => !l.is_active) && <p className="text-[13px] text-steel">Switched off: {lists.filter((l) => !l.is_active).map((l) => <button key={l.id} type="button" className="underline mr-2" onClick={() => setEdit(l)}>{l.name}</button>)}</p>}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New checklist" : edit ? `Edit · ${edit.name}` : ""}>
        {edit && <ListEditor key={edit === "new" ? "new" : edit.id} list={edit === "new" ? null : edit} teams={teams} jobs={jobs} positions={positions} people={people} look={look} preset={edit === "new" && view !== "all" && view !== "everyone" ? [view] : []} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}

/** Labels and colours for tags — a team in its own colour, a job in blue, a position in its team's colour. */
function lookFor(teams: Choice[], jobs: Choice[], positions: Choice[]): Look {
  const find = (t: string) => (t[0] === "d" ? teams : t[0] === "j" ? jobs : positions).find((c) => c.key === t.slice(2));
  return {
    label: (t) => find(t)?.label ?? t.slice(2).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    hue: (t) => (t[0] === "d" ? deptHue(t.slice(2)) : t[0] === "j" ? "var(--color-blue)" : deptHue(find(t)?.team ?? null)),
  };
}
const known = (t: string, teams: Choice[], jobs: Choice[], positions: Choice[]) => (t[0] === "d" ? teams : t[0] === "j" ? jobs : positions).some((c) => c.key === t.slice(2));

function ListEditor({ list, teams, jobs, positions, people, look, preset, onDone }: { list: List | null; teams: Choice[]; jobs: Choice[]; positions: Choice[]; people: Who[]; look: Look; preset: string[]; onDone: () => void }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [name, setName] = useState(list?.name ?? ""); const [shift, setShift] = useState<List["shift"]>(list?.shift ?? "opening");
  const [text, setText] = useState((list?.items ?? []).join("\n")); const [active, setActive] = useState(list?.is_active ?? true);
  const [tags, setTags] = useState<string[]>(list ? tagsOf(list) : preset);
  const [err, setErr] = useState<string | null>(null);
  const items = text.split("\n").map((x) => x.trim()).filter(Boolean);
  const flip = (t: string) => setTags((d) => (d.includes(t) ? d.filter((x) => x !== t) : [...d, t]));
  // a team, job or position written on the list that is no longer offered still shows, so it can be taken off
  const withOld = (kind: Kind, cs: Choice[]) => [...cs, ...keysOf(tags, kind).filter((k) => !cs.some((c) => c.key === k)).map((k) => ({ key: k, label: look.label(`${kind}:${k}`), people: 0 }))];
  const groups: { kind: Kind; title: string; choices: Choice[] }[] = [
    { kind: "d", title: "Teams", choices: withOld("d", teams) },
    { kind: "j", title: "Jobs", choices: withOld("j", jobs) },
    { kind: "p", title: "Positions", choices: withOld("p", positions) },
  ];
  const reach = tags.length ? people.filter((w) => reaches(tags, w)).length : null;
  return (
    <div className="space-y-4" data-list-editor>
      <label className="block"><span className="text-[13px] font-semibold text-steel">Name</span><input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Opening" /></label>
      <div><div className="text-[13px] font-semibold text-steel mb-1.5">When</div>
        <div className="grid grid-cols-3 gap-2">{(Object.keys(SHIFT) as List["shift"][]).map((k) => { const { w, Icon } = SHIFT[k]; return <button key={k} type="button" aria-pressed={shift === k} onClick={() => setShift(k)} className={cn("!min-h-12 rounded-2xl flex items-center justify-center gap-1.5 text-[14px] font-bold", shift === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}><Icon size={16} aria-hidden /><Say w={w} /></button>; })}</div></div>

      <div data-for-whom>
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          <span className="text-[13px] font-semibold text-steel">Who is this for</span>
          <span className="text-[12px] text-steel num" data-reach>{reach === null ? "Everyone on the staff" : plural(reach)}</span>
        </div>
        <button type="button" aria-pressed={!tags.length} onClick={() => setTags([])} data-dept="everyone"
          className={cn("!min-h-12 w-full rounded-2xl flex items-center gap-2 px-3 text-left text-[14px] font-bold", !tags.length ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}>
          <Users size={17} className="shrink-0" aria-hidden /><span className="truncate">Everyone</span></button>
        {groups.filter((g) => g.choices.length).map((g) => (
          <div key={g.kind} className="mt-3" data-for-kind={g.kind}>
            <div className="text-[11.5px] font-bold uppercase tracking-[.08em] text-steel mb-1.5">{g.title}</div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-2">
              {g.choices.map((c) => { const t = `${g.kind}:${c.key}`; const on = tags.includes(t); const hue = look.hue(t); return (
                <button key={t} type="button" aria-pressed={on} onClick={() => flip(t)} data-dept={g.kind === "d" ? c.key : undefined} data-tag={t}
                  className={cn("!min-h-12 min-w-0 rounded-2xl flex items-center gap-2 px-3 text-left", !on && "bg-[var(--color-fill)]")}
                  style={on ? { background: `color-mix(in srgb, ${hue} 18%, transparent)`, boxShadow: `inset 0 0 0 2px ${hue}` } : undefined}>
                  <span className="h-7 w-7 shrink-0 rounded-lg grid place-items-center" style={{ background: `color-mix(in srgb, ${hue} 20%, transparent)`, color: hue }}>{on ? <Check size={15} strokeWidth={3} aria-hidden /> : <TagIcon tag={t} size={15} />}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-bold leading-tight truncate">{c.label}</span>
                    <span className="block text-[11.5px] text-steel num">{c.people ? plural(c.people) : "nobody yet"}</span></span>
                </button>); })}
            </div>
          </div>))}
        <p className="mt-2 text-[12px] text-steel">Seen by the picked teams, jobs and positions. Owner, managers and supervisors see all.</p>
      </div>

      <label className="block"><span className="text-[13px] font-semibold text-steel">Duties — one a line <span className="num">({items.length}/40)</span></span>
        <textarea className="mt-1" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Gas checked\nFloor cleaned\nCash float counted"} /></label>
      {list && <label className="flex items-center gap-3 !min-h-11"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" /> <span className="text-[14px] font-semibold">In use (untick to hide it)</span></label>}
      {err && <p className="text-[14px] font-semibold text-chili" role="alert">{err}</p>}
      <button type="button" disabled={pending} className="svc-btn go w-full" data-save-list
        onClick={() => start(async () => { setErr(null); const r = await saveList(list?.id ?? null, name, shift, items, active, keysOf(tags, "d"), keysOf(tags, "j"), keysOf(tags, "p")); if ("error" in r) setErr(r.error!); else { toast("Saved"); onDone(); } })}>
        <Check size={18} aria-hidden /><Say w="save_list" /></button>
      {list && <p className="text-[12.5px] text-steel">Reorder only before anyone starts today, or ticks will shift.</p>}
    </div>
  );
}
