/**
 * The pure decisions behind Master control → Data (0172): the order tables are restored in, which tables a restore must
 * also bring back, and which backups are old enough to go.
 */
export type Fk = { child: string; parent: string };

/** Parents before children (so a restored order line finds its order), every name once. A cycle cannot be ordered;
 *  what is left of it goes last, by name — the database refuses a row whose parent is missing, so nothing is orphaned. */
export function orderTables(names: string[], fks: Fk[]): string[] {
  const set = new Set(names);
  const parents = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  for (const f of fks) if (set.has(f.child) && set.has(f.parent) && f.child !== f.parent) parents.get(f.child)!.add(f.parent);
  const out: string[] = []; const done = new Set<string>();
  let ready = names.filter((n) => parents.get(n)!.size === 0).sort();
  while (ready.length) {
    const n = ready.shift()!; out.push(n); done.add(n);
    const next: string[] = [];
    for (const m of names) if (!done.has(m) && !ready.includes(m) && [...parents.get(m)!].every((p) => done.has(p))) next.push(m);
    ready = [...ready, ...next].sort();
  }
  return [...out, ...names.filter((n) => !done.has(n)).sort()];
}

/** The chosen tables and every table they depend on, all the way up. */
export function withParents(chosen: string[], fks: Fk[], available?: Set<string>): string[] {
  const out = new Set(chosen); const queue = [...chosen];
  while (queue.length) {
    const t = queue.shift()!;
    for (const f of fks) if (f.child === t && !out.has(f.parent) && (!available || available.has(f.parent))) { out.add(f.parent); queue.push(f.parent); }
  }
  return [...out];
}

export type BackupRow = { id: string; kind: "manual" | "nightly" | "property"; status: "running" | "done" | "failed"; started_at: string; file_path: string | null };

/** What goes: full backups past the newest `keep`; failed runs over a week old; property exports over 30 days old. */
export function toPrune(rows: BackupRow[], keep: number, now = new Date()): BackupRow[] {
  const age = (r: BackupRow) => (now.getTime() - new Date(r.started_at).getTime()) / 86400000;
  const at = (r: BackupRow) => new Date(r.started_at).getTime();
  const full = rows.filter((r) => r.status === "done" && r.kind !== "property").sort((a, b) => at(b) - at(a));
  return [
    ...full.slice(Math.max(1, keep)),
    ...rows.filter((r) => r.status === "failed" && age(r) > 7),
    ...rows.filter((r) => r.status === "done" && r.kind === "property" && age(r) > 30),
  ];
}
