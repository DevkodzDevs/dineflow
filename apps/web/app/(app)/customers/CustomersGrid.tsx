"use client";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, MessageCircle, Phone, Star, Coins } from "lucide-react";
import { cn } from "@/components/ui";
import { formatINR, fmtDate } from "@/lib/format";

/**
 * Customers as a data grid (2026-10-23, the owner: "as Staff — a grid, a row opens the customer in a dialog, the cards
 * untouched; the grid from an iPad up, cards on a phone"). A row (click, Enter or Space) opens the customer's own sheet —
 * details, bills, points. Every column but the last sorts. Call and WhatsApp are small round keys at the row's end that
 * do not open it. Columns come with the grid's own room (container queries): Name and Phone always; Visits and Last visit
 * from 34rem; Spent from 44; Points (with loyalty on) from 54; First visit and Birthday from 66.
 */
export type GridCustomer = { id: string; phone: string; name: string | null; tags: string[]; visits: number; total_spend: number; points: number; first_visit_at: string; last_visit_at: string | null; birthday: string | null };
type Key = "name" | "phone" | "visits" | "spent" | "last" | "points" | "first" | "birthday";
const AT: Partial<Record<Key, string>> = {
  visits: "hidden @[34rem]:table-cell", last: "hidden @[34rem]:table-cell", spent: "hidden @[44rem]:table-cell",
  points: "hidden @[54rem]:table-cell", first: "hidden @[66rem]:table-cell", birthday: "hidden @[66rem]:table-cell",
};
const HUES = ["--color-green", "--color-blue", "--color-orange", "--color-violet", "--color-red"];
const days = (iso: string | null) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const agoOf = (d: number | null) => d === null ? "—" : d === 0 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : d < 30 ? `${Math.round(d / 7)} wk ago` : d < 365 ? `${Math.round(d / 30)} mth ago` : `${Math.round(d / 365)} yr ago`;
const phoneOut = (p: string) => (p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

export function CustomersGrid<C extends GridCustomer>({ rows, loyalty, waHref, onOpen }: { rows: C[]; loyalty: { enabled: boolean; minRedeem: number }; waHref: (c: C) => string; onOpen: (c: C) => void }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 } | null>(null);
  const cols: { key: Key; label: string; num?: boolean }[] = [
    { key: "name", label: "Name" }, { key: "phone", label: "Phone", num: true }, { key: "visits", label: "Visits", num: true },
    { key: "spent", label: "Spent", num: true }, { key: "last", label: "Last visit" },
    ...(loyalty.enabled ? [{ key: "points" as Key, label: "Points", num: true }] : []),
    { key: "first", label: "First visit" }, { key: "birthday", label: "Birthday" },
  ];
  const by: Record<Key, (a: C, b: C) => number> = {
    name: (a, b) => (a.name ?? "~").localeCompare(b.name ?? "~"), phone: (a, b) => a.phone.localeCompare(b.phone),
    visits: (a, b) => a.visits - b.visits, spent: (a, b) => Number(a.total_spend) - Number(b.total_spend),
    last: (a, b) => (a.last_visit_at ?? "").localeCompare(b.last_visit_at ?? ""), points: (a, b) => Number(a.points) - Number(b.points),
    first: (a, b) => a.first_visit_at.localeCompare(b.first_visit_at), birthday: (a, b) => (a.birthday?.slice(5) ?? "~").localeCompare(b.birthday?.slice(5) ?? "~"),
  };
  const list = useMemo(() => (sort ? [...rows].sort((a, b) => by[sort.key](a, b) * sort.dir) : rows), [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (k: Key) => setSort((s) => (!s || s.key !== k ? { key: k, dir: k === "name" || k === "phone" ? 1 : -1 } : s.dir === -1 ? { key: k, dir: 1 } : null));
  const cell = (k: Key, extra?: string) => cn("px-3.5 py-2.5 align-middle border-b border-[var(--color-separator)]", AT[k], extra);
  const td = (c: C, k: Key): ReactNode => {
    switch (k) {
      case "name": { const hue = HUES[(c.name ?? c.phone).charCodeAt(0) % HUES.length]; return (
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-9 w-9 shrink-0 rounded-full grid place-items-center font-display text-[17px] text-[var(--color-bezel)]" style={{ background: `var(${hue})` }} aria-hidden>{(c.name ?? "#").trim().slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0"><span className="text-[14.5px] font-extrabold truncate">{c.name ?? "No name"}</span>{c.visits >= 3 && <Star size={13} className="shrink-0 text-[var(--color-orange)] fill-current" aria-label="Regular" />}</div>
            {c.tags.length > 0 && <div className="text-[11.5px] text-[var(--color-label-2)] truncate mt-0.5">{c.tags.join(" · ")}</div>}
          </div>
        </div>); }
      case "phone": return <span className="num text-[13px] font-semibold whitespace-nowrap">{phoneOut(c.phone)}</span>;
      case "visits": return <span className="num text-[13.5px] font-bold">{c.visits}</span>;
      case "spent": return <span className="num text-[13.5px] font-semibold whitespace-nowrap">{formatINR(Number(c.total_spend), { whole: true })}</span>;
      case "last": { const d = days(c.last_visit_at); return <span className={cn("text-[13px] whitespace-nowrap", d !== null && d >= 60 ? "text-[var(--color-red)] font-semibold" : "")}>{agoOf(d)}</span>; }
      case "points": { const p = Math.round(Number(c.points)); return p > 0 ? <span className={cn("inline-flex items-center gap-1 num text-[13px] whitespace-nowrap", p >= loyalty.minRedeem ? "font-bold text-[var(--color-green)]" : "")}><Coins size={13} aria-hidden />{p}</span> : <span className="text-steel">—</span>; }
      case "first": return <span className="text-[13px] whitespace-nowrap">{fmtDate(c.first_visit_at)}</span>;
      case "birthday": return <span className="text-[13px] whitespace-nowrap">{c.birthday ? new Date(c.birthday + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}</span>;
    }
  };
  const key = "h-9 w-9 !min-h-9 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:!min-h-11 rounded-full grid place-items-center transition-colors";
  return (
    <div className="rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-customers-grid>
      <div className="@container overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left" aria-label="Customers">
          <thead><tr>
            {cols.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3.5 h-11 bg-[color-mix(in_srgb,var(--color-bg-2)_92%,var(--color-bg-3))] border-b border-[var(--color-separator)] whitespace-nowrap", AT[c.key])} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => flip(c.key)} className="!min-h-0 h-11 inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-[var(--color-label-2)] hover:text-[var(--color-label)]" data-sort={c.key}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />) : <ArrowUpDown size={13} className="opacity-40" aria-hidden />}</button>
              </th>))}
            <th className="w-[1%] bg-[color-mix(in_srgb,var(--color-bg-2)_92%,var(--color-bg-3))] border-b border-[var(--color-separator)]" aria-hidden />
          </tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} tabIndex={0} data-customer-row={c.id} aria-label={`${c.name ?? c.phone} — open`}
                onClick={() => onOpen(c)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(c); } }}
                className="cursor-pointer transition-colors hover:bg-[var(--color-fill)] focus-visible:outline-2 focus-visible:outline-[var(--color-tint)] focus-visible:-outline-offset-2">
                {cols.map((col) => <td key={col.key} className={cell(col.key, col.key === "name" ? "min-w-[12rem] max-w-[18rem]" : undefined)}>{td(c, col.key)}</td>)}
                <td className={cell("name", "pr-3")}>
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <a href={`tel:${c.phone}`} className={cn(key, "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")} aria-label={`Call ${c.name ?? c.phone}`} title="Call"><Phone size={15} aria-hidden /></a>
                    <a href={waHref(c)} target="_blank" rel="noreferrer" className={cn(key, "bg-[color-mix(in_srgb,var(--color-green)_16%,transparent)] text-[var(--color-green)] hover:bg-[color-mix(in_srgb,var(--color-green)_26%,transparent)]")} aria-label={`WhatsApp ${c.name ?? c.phone}`} title="WhatsApp"><MessageCircle size={15} aria-hidden /></a>
                    <ChevronRight size={16} className="text-[var(--color-label-3)] ml-0.5" aria-hidden />
                  </div>
                </td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
