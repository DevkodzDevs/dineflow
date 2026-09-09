"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "./index";

/**
 * One table for the whole product. Sortable headers, a search box, right-aligned numbers, a sticky
 * header, sensible paging, an honest empty state — and on a phone every row becomes a card with its
 * own labels, so nothing has to scroll sideways.
 *
 *   <DataTable rows={rows} rowKey="id" columns={[
 *     { key: "name", label: "Property", primary: true },
 *     { key: "sales", label: "Today", num: true, render: (r) => formatINR(r.sales) },
 *   ]} search={["name", "type"]} actions={(r) => <Button …/>} />
 */
export type Col<T> = { key: keyof T & string; label: string; num?: boolean; primary?: boolean; render?: (row: T) => ReactNode; sort?: (a: T, b: T) => number; width?: string; hideOnPhone?: boolean };
export function DataTable<T extends Record<string, unknown>>({ rows, columns, rowKey, search, actions, pageSize = 25, empty = "Nothing here yet", dense, toolbar, className }: {
  rows: T[]; columns: Col<T>[]; rowKey: keyof T & string; search?: (keyof T & string)[]; actions?: (row: T) => ReactNode; pageSize?: number; empty?: ReactNode; dense?: boolean; toolbar?: ReactNode; className?: string;
}) {
  const [q, setQ] = useState(""); const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null); const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = t && search ? rows.filter((r) => search.some((k) => String(r[k] ?? "").toLowerCase().includes(t))) : rows;
    if (sort) { const col = columns.find((c) => c.key === sort.key); out = [...out].sort((a, b) => (col?.sort ? col.sort(a, b) : cmp(a[sort.key], b[sort.key])) * sort.dir); }
    return out;
  }, [rows, q, sort, search, columns]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const cur = Math.min(page, pages - 1); const slice = filtered.slice(cur * pageSize, cur * pageSize + pageSize);
  const toggle = (k: string) => setSort((s) => (!s || s.key !== k ? { key: k, dir: 1 } : s.dir === 1 ? { key: k, dir: -1 } : null));
  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <div className={cn("dt-shell", className)}>
      {(search || toolbar) && <div className="dt-bar">
        {search && <label className="dt-search"><Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…" aria-label="Search this table" /></label>}
        {toolbar}
        <span className="dt-count">{filtered.length === rows.length ? `${rows.length} ${rows.length === 1 ? "row" : "rows"}` : `${filtered.length} of ${rows.length}`}</span>
      </div>}
      <div className="table-wrap dt-wrap">
        <table className={cn("dt", dense && "dt-dense")}>
          <thead><tr>{columns.map((c) => <th key={c.key} style={c.width ? { width: c.width } : undefined} className={cn(c.num && "num-col", c.hideOnPhone && "phone-hide")}><button type="button" onClick={() => toggle(c.key)} className="dt-th" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>{c.label}{sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} className="dt-sort-idle" />}</button></th>)}{actions && <th className="dt-actions-h" />}</tr></thead>
          <tbody>
            {slice.map((r) => <tr key={String(r[rowKey])}>{columns.map((c) => <td key={c.key} data-label={c.label} className={cn(c.num && "num-col num", c.primary && "dt-primary", c.hideOnPhone && "phone-hide")}>{c.render ? c.render(r) : String(r[c.key] ?? "")}</td>)}{actions && <td className="dt-actions" data-label="">{actions(r)}</td>}</tr>)}
            {slice.length === 0 && <tr className="dt-empty"><td colSpan={columns.length + (actions ? 1 : 0)}><Inbox size={22} /><span>{q ? `Nothing matches "${q}"` : empty}</span></td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && <div className="dt-foot"><span>{cur * pageSize + 1}–{Math.min(filtered.length, (cur + 1) * pageSize)} of {filtered.length}</span><span className="dt-pager"><button disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><span className="num">{cur + 1} / {pages}</span><button disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight size={16} /></button></span></div>}
      <span className="sr-only">{primary.label}</span>
    </div>
  );
}
const cmp = (a: unknown, b: unknown) => { if (a == null) return 1; if (b == null) return -1; if (typeof a === "number" && typeof b === "number") return a - b; return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }); };
