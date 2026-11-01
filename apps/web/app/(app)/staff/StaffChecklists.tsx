"use client";
import Link from "next/link";
import { Check, ListChecks, RotateCcw, Sunrise, Moon, Clock3 } from "lucide-react";
import { cn } from "@/components/ui";
import { listByPosition, listFor, SEES_EVERY_LIST, type ListAudience, type ListPerson } from "@/lib/checklists";

/** An active list as the Staff screen needs it: its name, its shift, how many duties, and whose it is (0162). */
export type StaffList = ListAudience & { name: string; shift: "opening" | "closing" | "anytime"; items: number };
/**
 * What the sheet holds for one person's lists: null — untouched (as saved: their position's lists with any change already
 * made); "position" — back to their position's lists (Reset); an array — the lists ticked by hand.
 */
export type ListPick = string[] | "position" | null;

const SHIFT = { opening: Sunrise, closing: Moon, anytime: Clock3 } as const;

/** The lists ticked on screen for this pick. */
export function shownLists(lists: StaffList[], person: ListPerson, pick: ListPick): string[] {
  if (Array.isArray(pick)) return pick;
  return lists.filter((l) => (pick === "position" ? listByPosition(l, person) : listFor(l, person))).map((l) => l.id);
}

/**
 * Checklists, in Add staff and a person's Access (2026-11-02, the owner: "set the checklists that person handles — by
 * default from their job position, and a manager can change it"). Each active list is a chip: tinted and ticked when it
 * is theirs, an amber dot when that differs from their position. The head counts them and says whether the set is the
 * position's; Reset puts it back. The owner, managers and supervisors see every list — one line, nothing to set.
 */
export function StaffChecklists({ lists, person, pick, onPick }: { lists: StaffList[]; person: ListPerson; pick: ListPick; onPick: (p: ListPick) => void }) {
  if (SEES_EVERY_LIST.includes(person.role)) return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-fill)] px-4 py-3" data-staff-lists="every">
      <ListChecks size={18} className="shrink-0 text-steel" aria-hidden /><p className="text-[13.5px] text-steel">Sees every checklist</p>
    </div>);
  if (!lists.length) return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--color-fill)] px-4 py-3" data-staff-lists="none">
      <ListChecks size={18} className="shrink-0 text-steel" aria-hidden /><p className="text-[13.5px] text-steel flex-1">No checklists yet</p>
      <Link href="/tasks" className="text-[13.5px] font-bold text-[var(--color-tint)]">Make one</Link>
    </div>);
  const on = shownLists(lists, person, pick);
  const byPos = new Set(lists.filter((l) => listByPosition(l, person)).map((l) => l.id));
  const changed = lists.some((l) => on.includes(l.id) !== byPos.has(l.id));
  const flip = (id: string) => onPick(on.includes(id) ? on.filter((x) => x !== id) : [...on, id]);
  return (
    <div className="space-y-3" data-staff-lists="set">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[13px] font-bold text-steel num" data-staff-lists-count>{on.length} of {lists.length}</span>
        <span className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-extrabold",
          changed ? "bg-[var(--color-orange-2)] text-[var(--color-orange)]" : "bg-[var(--color-green-2)] text-[var(--color-green)]")} data-staff-lists-state={changed ? "changed" : "position"}>
          {changed ? "Changed" : <><Check size={12} aria-hidden />From position</>}</span>
        {changed && <button type="button" className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] text-[13px] font-bold shrink-0" onClick={() => onPick("position")} data-staff-lists-reset>
          <RotateCcw size={14} aria-hidden />Reset</button>}
      </div>
      <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,11rem),1fr))]">
        {lists.map((l) => {
          const mine = on.includes(l.id), differs = mine !== byPos.has(l.id), Icon = SHIFT[l.shift] ?? Clock3;
          return (
            <button key={l.id} type="button" role="checkbox" aria-checked={mine} onClick={() => flip(l.id)} title={differs ? (mine ? "Added" : "Taken off") : "From position"}
              className={cn("relative min-w-0 min-h-11 flex items-center gap-2.5 rounded-2xl pl-3 pr-2.5 py-2 text-left border transition-colors",
                mine ? "bg-[color-mix(in_srgb,var(--color-tint)_12%,transparent)] border-[color-mix(in_srgb,var(--color-tint)_40%,transparent)]" : "bg-[var(--color-fill)] border-transparent hover:bg-[var(--color-fill-2)]")}
              data-staff-list={l.name} data-on={mine ? "true" : "false"} data-differs={differs || undefined}>
              <Icon size={16} className={cn("shrink-0", mine ? "text-[var(--color-tint)]" : "text-steel")} aria-hidden />
              <span className="min-w-0 flex-1 leading-tight">
                <span className={cn("block text-[14px] font-semibold line-clamp-2 [overflow-wrap:anywhere]", !mine && "text-[var(--color-label-2)]")}>{l.name}</span>
                <span className="block text-[11.5px] text-steel num">{l.items} {l.items === 1 ? "duty" : "duties"}</span>
              </span>
              <span className={cn("h-6 w-6 shrink-0 rounded-full grid place-items-center", mine ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "border-2 border-[var(--color-line-2)]")} aria-hidden>{mine && <Check size={14} strokeWidth={3} />}</span>
              {differs && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[var(--color-orange)]" aria-hidden />}
            </button>);
        })}
      </div>
    </div>);
}
