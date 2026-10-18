"use client";
import { useState, useTransition } from "react";
import { Check, Sunrise, Moon, Clock3, Pencil, Plus, Sparkles } from "lucide-react";
import { Card, Empty, Sheet, cn, useToast } from "@/components/ui";
import { tick, saveList } from "./actions";
import { Say } from "@/components/ui/Say";

export type List = { id: string; name: string; shift: "opening" | "closing" | "anytime"; items: string[]; is_active: boolean; sort_order: number };
export type Run = { checklist_id: string; run_date: string; done: Record<string, { name: string; at: string }>; completed_at: string | null };

const SHIFT = { opening: { label: "Opening", w: "opening", Icon: Sunrise }, closing: { label: "Closing", w: "closing", Icon: Moon }, anytime: { label: "Any time", w: "any_time", Icon: Clock3 } } as const;
/** Two lists most kitchens in India start from; the owner edits them to fit. */
const STARTERS: { name: string; shift: List["shift"]; items: string[] }[] = [
  { name: "Opening", shift: "opening", items: ["Gas and burners checked", "Fridge and freezer temperatures noted", "Floor and tables cleaned", "Hand-wash soap and towels stocked", "Cash float counted", "Today's specials told to the floor", "Sold-out dishes switched off on the menu"] },
  { name: "Closing", shift: "closing", items: ["Gas valves shut", "Leftovers labelled and stored", "Kitchen and floor washed", "Garbage taken out", "Cash counted and shift closed", "Lights, fans and AC off", "Doors and shutters locked"] },
];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/**
 * One card per list: a progress bar, then each duty as a 56px row — a tap ticks it with your name and the time, a
 * second tap unticks it. Under the card, the last seven days as dots (green done, amber part, grey nothing). Owners,
 * managers and supervisors also get Edit and New list.
 */
export function TasksClient({ lists, runs, today, editor }: { lists: List[]; runs: Run[]; today: string; editor: boolean }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [mine, setMine] = useState<Record<string, Run["done"]>>({});   // today's ticks as this screen knows them
  const [edit, setEdit] = useState<List | "new" | null>(null);
  const active = lists.filter((l) => l.is_active);
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
    toast("Opening and Closing lists added — edit them to fit");
  });

  return (
    <div className="space-y-5">
      {editor && <div className="flex flex-wrap gap-2">
        <button type="button" className="svc-btn go sm !px-5" onClick={() => setEdit("new")} data-new-list><Plus size={18} aria-hidden /><Say w="new_list" /></button>
        {lists.length === 0 && <button type="button" disabled={pending} className="svc-btn quiet sm !px-5" onClick={starters} data-starter-lists><Sparkles size={18} aria-hidden /> Start with Opening & Closing</button>}
      </div>}

      {active.length === 0 ? <Empty title="No checklists yet" hint={editor ? "Add the Opening and Closing lists most kitchens use, then change them to fit yours." : "Ask the owner or a manager to set up the opening and closing lists."} /> : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3" data-lists>
          {active.map((l) => {
            const done = doneOf(l); const n = Object.keys(done).length; const all = n >= l.items.length; const { label, Icon } = SHIFT[l.shift];
            return (
              <Card key={l.id} className="min-w-0 !p-0 overflow-hidden" data-list={l.name}>
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("h-10 w-10 shrink-0 rounded-xl grid place-items-center", all ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-fill)]")}>{all ? <Check size={20} strokeWidth={3} aria-hidden /> : <Icon size={19} aria-hidden />}</span>
                    <div className="min-w-0 flex-1"><div className="text-[17px] font-extrabold truncate">{l.name}</div><div className="text-[12.5px] text-steel">{label} · <span className="num" data-progress>{n}/{l.items.length}</span>{all ? " · all done" : ""}</div></div>
                    {editor && <button type="button" onClick={() => setEdit(l)} className="h-11 w-11 shrink-0 grid place-items-center rounded-xl text-steel hover:bg-[var(--color-fill)]" aria-label={`Edit ${l.name}`}><Pencil size={17} /></button>}
                  </div>
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
        {edit && <ListEditor key={edit === "new" ? "new" : edit.id} list={edit === "new" ? null : edit} onDone={() => setEdit(null)} />}
      </Sheet>
    </div>
  );
}

function ListEditor({ list, onDone }: { list: List | null; onDone: () => void }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [name, setName] = useState(list?.name ?? ""); const [shift, setShift] = useState<List["shift"]>(list?.shift ?? "opening");
  const [text, setText] = useState((list?.items ?? []).join("\n")); const [active, setActive] = useState(list?.is_active ?? true);
  const [err, setErr] = useState<string | null>(null);
  const items = text.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-4" data-list-editor>
      <label className="block"><span className="text-[13px] font-semibold text-steel">Name</span><input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Opening" /></label>
      <div><div className="text-[13px] font-semibold text-steel mb-1.5">When</div>
        <div className="grid grid-cols-3 gap-2">{(Object.keys(SHIFT) as List["shift"][]).map((k) => { const { w, Icon } = SHIFT[k]; return <button key={k} type="button" aria-pressed={shift === k} onClick={() => setShift(k)} className={cn("!min-h-12 rounded-2xl flex items-center justify-center gap-1.5 text-[14px] font-bold", shift === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)]")}><Icon size={16} aria-hidden /><Say w={w} /></button>; })}</div></div>
      <label className="block"><span className="text-[13px] font-semibold text-steel">Duties — one a line <span className="num">({items.length}/40)</span></span>
        <textarea className="mt-1" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Gas checked\nFloor cleaned\nCash float counted"} /></label>
      {list && <label className="flex items-center gap-3 !min-h-11"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-5 w-5" /> <span className="text-[14px] font-semibold">In use (untick to hide it)</span></label>}
      {err && <p className="text-[14px] font-semibold text-chili" role="alert">{err}</p>}
      <button type="button" disabled={pending} className="svc-btn go w-full" data-save-list
        onClick={() => start(async () => { setErr(null); const r = await saveList(list?.id ?? null, name, shift, items, active); if ("error" in r) setErr(r.error!); else { toast("Saved"); onDone(); } })}>
        <Check size={18} aria-hidden /><Say w="save_list" /></button>
      {list && <p className="text-[12.5px] text-steel">Ticks are kept by position: reorder duties on a day nobody has started, or today&apos;s ticks will sit against the new order.</p>}
    </div>
  );
}
