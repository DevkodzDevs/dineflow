import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Which tables were merged into an open order (2026-11-04, the owner: "when I merge one table with another, show both tables
 * merged"). `merge_orders` (0071/0077) moves the joining order's lines and tickets onto the other, cancels it with
 * `merged_into` = the order it joined, and keeps its `table_id` — so the merged tables are read back from those rows; nothing
 * new is stored. A merge of a merge (A into B, B into C) resolves to C.
 *
 * A merged table stops counting once it has an open order of its own again (somebody seated a new party there). Read with
 * the screen's own rows (`mergedRows`, three days back — an order open longer than that is a table someone forgot to close).
 */
export type MergedRow = { id: string; table_id: string | null; merged_into: string | null };
/** open order id → the table ids merged into it */
export type Merged = Record<string, string[]>;

export function mergedRows(s: SupabaseClient) {
  return s.from("orders").select("id, table_id, merged_into").eq("status", "cancelled").not("merged_into", "is", null)
    .gte("created_at", new Date(Date.now() - 3 * 864e5).toISOString()).limit(400);
}

export function mergedTables(rows: MergedRow[] | null | undefined, open: { id: string; table_id: string | null }[]): Merged {
  const out: Merged = {}; if (!rows?.length || !open.length) return out;
  const openIds = new Set(open.map((o) => o.id));
  const ownTable = new Map(open.map((o) => [o.id, o.table_id]));
  const busy = new Set(open.map((o) => o.table_id).filter((t): t is string => !!t));
  const into = new Map(rows.map((r) => [r.id, r.merged_into]));
  /** follow merged_into until an open order (at most a few hops) */
  const top = (id: string | null): string | null => { for (let i = 0; i < 6 && id; i++) { if (openIds.has(id)) return id; id = into.get(id) ?? null; } return null; };
  for (const r of rows) {
    const t = top(r.merged_into);
    if (!t || !r.table_id || r.table_id === ownTable.get(t) || busy.has(r.table_id)) continue;
    const list = (out[t] ??= []); if (!list.includes(r.table_id)) list.push(r.table_id);
  }
  return out;
}
