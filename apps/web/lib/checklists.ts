/**
 * Whose checklist a list is (0122 teams, 0123 jobs and positions, 0162 per person). Shared by My day, Checklists and the
 * Staff screen, server and client alike, so it lives outside any "use client" file.
 *
 * By position (the database's `_checklist_default`): a list naming no team, job or position is everyone's; otherwise it is
 * for a person whose team (their department, else their role's), job (role) or position it names. Per person
 * (`_checklist_for_me`, 0162): someone in `people_off` is taken off it, someone in `people` is given it, whatever the
 * position says. The owner, managers and supervisors write the lists and see every one (RLS), so the Staff screen sets
 * nothing for them.
 */
import { myDept } from "@/app/(app)/tasks/dept";

export type ListAudience = { id: string; departments?: string[] | null; jobs?: string[] | null; positions?: string[] | null; people?: string[] | null; people_off?: string[] | null };
export type ListPerson = { id?: string | null; role: string; department?: string | null; position?: string | null };

/** These roles see every list and have nothing to set. */
export const SEES_EVERY_LIST = ["owner", "manager", "supervisor"];

/** Is this list one of this person's by their team, job or position (or everyone's)? */
export function listByPosition(l: ListAudience, w: ListPerson): boolean {
  const d = l.departments ?? [], j = l.jobs ?? [], p = l.positions ?? [];
  if (!d.length && !j.length && !p.length) return true;
  const team = myDept(w.role, w.department ?? null);
  return (!!team && d.includes(team)) || j.includes(w.role) || (!!w.position && p.includes(w.position));
}

/** Is this list this person's — their position's lists, with what the owner or a manager changed for them. */
export function listFor(l: ListAudience, w: ListPerson): boolean {
  if (w.id && (l.people_off ?? []).includes(w.id)) return false;
  if (w.id && (l.people ?? []).includes(w.id)) return true;
  return listByPosition(l, w);
}

/** Has this person's set been changed from their position's on any list? */
export const changedFor = (lists: ListAudience[], id: string) => lists.some((l) => (l.people ?? []).includes(id) || (l.people_off ?? []).includes(id));
