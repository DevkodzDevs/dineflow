"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight, Inbox, Clock3, Star, ShieldAlert, Flame, CheckCircle2, Hourglass, Loader } from "lucide-react";
import { cn } from "@/components/ui";
import { KINDS, kindOf, ticketNo, when, daysLeft, topicLabel } from "@/lib/support";
import { kindIcon } from "@/components/support/icons";
import { StatusChip, PriorityChip } from "@/components/support/chips";

export type Row = { id: string; ticket_no: number; kind: string; topic: string | null; priority: string; status: string; subject: string; allow_access: boolean; due_by: string | null; rating: number | null;
  last_message_at: string; last_message_side: string; support_seen_at: string | null; first_response_at: string | null; resolved_at: string | null; created_at: string;
  raised_name: string | null; raised_role: string | null; restaurant_id: string; property: string; property_type: string; unread: boolean; messages: number; first_line: string | null };

const ROLE: Record<string, string> = { owner: "Owner", manager: "Manager", supervisor: "Supervisor", cashier: "Cashier", waiter: "Waiter", chef: "Chef", housekeeping: "Housekeeping", frontdesk: "Front desk", master: "Master control" };
const live = (r: Row) => r.status !== "resolved" && r.status !== "closed";
const needsReply = (r: Row) => live(r) && r.last_message_side === "user";
const day = 86400000;
/** "2h 10m", "35 min", "1d 4h" */
const dur = (ms: number) => { const m = Math.round(ms / 60000); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`; const d = Math.floor(h / 24); return h % 24 ? `${d}d ${h % 24}h` : `${d}d`; };

type Tab = "reply" | "open" | "waiting" | "resolved" | "closed" | "all";

export function SupportDesk({ rows, error }: { rows: Row[]; error: string | null }) {
  const [tab, setTab] = useState<Tab>(rows.some(needsReply) ? "reply" : "all");
  const [kind, setKind] = useState("all"); const [prop, setProp] = useState("all"); const [q, setQ] = useState("");

  const stats = useMemo(() => {
    const now = Date.now();
    const firsts = rows.filter((r) => r.first_response_at && now - new Date(r.created_at).getTime() < 30 * day).map((r) => new Date(r.first_response_at!).getTime() - new Date(r.created_at).getTime()).sort((a, b) => a - b);
    const rated = rows.filter((r) => r.rating && now - new Date(r.created_at).getTime() < 30 * day);
    return {
      reply: rows.filter(needsReply).length,
      progress: rows.filter((r) => r.status === "in_progress").length,
      waiting: rows.filter((r) => r.status === "waiting").length,
      hot: rows.filter((r) => live(r) && (r.priority === "urgent" || r.priority === "high")).length,
      privacy: rows.filter((r) => live(r) && r.kind === "privacy" && (daysLeft(r.due_by) ?? 99) <= 3).length,
      resolved7: rows.filter((r) => r.resolved_at && now - new Date(r.resolved_at).getTime() < 7 * day).length,
      firstReply: firsts.length ? dur(firsts[Math.floor(firsts.length / 2)]) : null, firstN: firsts.length,
      rating: rated.length ? (rated.reduce((t, r) => t + (r.rating ?? 0), 0) / rated.length).toFixed(1) : null, ratedN: rated.length,
    };
  }, [rows]);

  const properties = useMemo(() => [...new Map(rows.map((r) => [r.restaurant_id, r.property])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const count = (t: Tab) => rows.filter((r) => match(r, t)).length;
  const match = (r: Row, t: Tab) => t === "all" || (t === "reply" ? needsReply(r) : t === "open" ? r.status === "open" || r.status === "in_progress" : r.status === t);
  const needle = q.trim().toLowerCase().replace(/^#?sup-0*/, "");
  const shown = rows.filter((r) => match(r, tab) && (kind === "all" || r.kind === kind) && (prop === "all" || r.restaurant_id === prop)
    && (!needle || [r.subject, r.first_line, r.raised_name, r.property, String(r.ticket_no)].some((x) => (x ?? "").toLowerCase().includes(needle))));

  const tiles: { label: string; value: string | number; sub: string; Icon: typeof Inbox; tone?: string }[] = [
    { label: "Needs a reply", value: stats.reply, sub: "property spoke last", Icon: Inbox, tone: stats.reply ? "--color-red" : undefined },
    { label: "In progress", value: stats.progress, sub: "being worked on", Icon: Loader },
    { label: "Waiting on customer", value: stats.waiting, sub: "we asked, they owe", Icon: Hourglass },
    { label: "Urgent & high", value: stats.hot, sub: "still open", Icon: Flame, tone: stats.hot ? "--color-orange" : undefined },
    { label: "Privacy due", value: stats.privacy, sub: "≤ 3 days left of 15", Icon: ShieldAlert, tone: stats.privacy ? "--color-red" : undefined },
    { label: "Resolved", value: stats.resolved7, sub: "last 7 days", Icon: CheckCircle2, tone: "--color-green" },
    { label: "First reply", value: stats.firstReply ?? "—", sub: stats.firstN ? `median of ${stats.firstN}, 30 days` : "no replies yet", Icon: Clock3 },
    { label: "Rating", value: stats.rating ? `${stats.rating} ★` : "—", sub: stats.ratedN ? `${stats.ratedN} rated, 30 days` : "none rated yet", Icon: Star },
  ];

  return (
    <div className="space-y-6" data-support-desk>
      <div className="aurora">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Help & support</div>
        <h1 className="text-4xl">{rows.filter(live).length} open <em>request{rows.filter(live).length === 1 ? "" : "s"}</em></h1>
        <p className="text-sm text-[var(--color-label-2)] mt-1.5 max-w-2xl">From every property</p>
      </div>
      {error && <p className="rounded-xl bg-[var(--color-red-2)] px-4 py-3 text-sm text-[var(--color-red)]">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-desk-stats>
        {tiles.map(({ label, value, sub, Icon, tone }) => (
          <div key={label} className="feather p-4 min-w-0" style={tone ? { borderColor: `color-mix(in srgb, var(${tone}) 40%, transparent)` } : undefined}>
            <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-label-2)]"><Icon size={14} style={tone ? { color: `var(${tone})` } : undefined} className="shrink-0" /><span className="truncate">{label}</span></div>
            <div className="mt-2 font-display num text-[30px] leading-none" style={tone ? { color: `var(${tone})` } : undefined}>{value}</div>
            <div className="mt-1.5 text-[11.5px] text-[var(--color-label-3)] truncate">{sub}</div>
          </div>
        ))}
      </div>

      <div className="feather p-3 sm:p-4 space-y-3" data-desk-filters>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] -mx-1 px-1">
          {([["reply", "Needs reply"], ["open", "Open"], ["waiting", "Waiting"], ["resolved", "Resolved"], ["closed", "Closed"], ["all", "All"]] as [Tab, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={cn("chip shrink-0 whitespace-nowrap", tab === k && "on")} data-tab={k}>
              {l}<span className={cn("num text-[11px] rounded-full px-1.5", tab === k ? "bg-white/20" : "bg-[var(--color-bg-2)] text-[var(--color-label-2)]")}>{count(k)}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,14rem)_minmax(0,1fr)]">
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind"><option value="all">Every kind</option>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
          <select value={prop} onChange={(e) => setProp(e.target.value)} aria-label="Property"><option value="all">Every property</option>{properties.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          <label className="relative block min-w-0"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject, name, SUP-12…" aria-label="Search requests" className="!pl-9 w-full min-w-0" /></label>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="feather p-10 text-center text-sm text-[var(--color-label-2)]" data-desk-empty>{rows.length ? "No matches" : "No requests yet"}</div>
      ) : (
        <ul className="space-y-2" data-desk-list>
          {shown.map((r) => {
            const k = kindOf(r.kind); const Icon = kindIcon(r.kind); const left = r.kind === "privacy" && live(r) ? daysLeft(r.due_by) : null;
            return (
              <li key={r.id}>
                <Link href={`/admin/support/${r.id}`} data-ticket={r.ticket_no} data-unread={r.unread || undefined}
                  className="feather feather-lift grid gap-x-4 gap-y-2 p-3.5 sm:p-4 items-center grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,11rem)_minmax(0,10rem)_auto_auto]">
                  <span className="relative h-10 w-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: `color-mix(in srgb, var(${k.tone}) 16%, transparent)`, color: `var(${k.tone})` }}>
                    <Icon size={17} />{r.unread && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--color-red)] ring-2 ring-[var(--color-bg-2)]" aria-label="Unread" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 min-w-0"><span className="num text-[11.5px] text-[var(--color-label-3)] shrink-0">{ticketNo(r.ticket_no)}</span><span className={cn("text-[14px] truncate", r.unread ? "font-bold" : "font-semibold")}>{r.subject}</span></span>
                    <span className="block text-[12.5px] text-[var(--color-label-2)] truncate">{r.first_line}</span>
                    <span className="lg:hidden block text-[12px] text-[var(--color-label-2)] truncate mt-0.5" suppressHydrationWarning>{r.property} · {r.raised_name ?? "—"} · {when(r.last_message_at)}</span>
                  </span>
                  <span className="hidden lg:block min-w-0"><span className="block text-[13px] font-semibold truncate">{r.property}</span><span className="block text-[11.5px] text-[var(--color-label-2)] truncate"><span className="capitalize">{r.property_type}</span>{r.allow_access ? " · access allowed" : ""}</span></span>
                  <span className="hidden lg:block min-w-0"><span className="block text-[13px] truncate">{r.raised_name ?? "—"}</span><span className="block text-[11.5px] text-[var(--color-label-2)] truncate">{ROLE[r.raised_role ?? ""] ?? r.raised_role ?? ""}</span></span>
                  <span className="flex flex-col items-end gap-1 col-start-3 row-start-1 lg:col-start-auto lg:row-start-auto">
                    <StatusChip status={r.status} desk />
                    <span className="flex gap-1">{r.priority !== "normal" && <PriorityChip priority={r.priority} />}{r.kind === "privacy" && <span className="h-6 px-2 rounded-full text-[11px] font-semibold inline-flex items-center bg-[var(--color-fill)] text-[var(--color-label-2)] whitespace-nowrap">{topicLabel(r.topic) ?? "Privacy"}</span>}</span>
                  </span>
                  <span className="hidden lg:flex items-center gap-2 text-[12px] text-[var(--color-label-2)] whitespace-nowrap" suppressHydrationWarning>
                    <span className="text-right">{when(r.last_message_at)}{left !== null && <span className={cn("block font-semibold", left <= 3 ? "text-[var(--color-red)]" : "text-[var(--color-label-2)]")}>{left >= 0 ? `due in ${left}d` : "overdue"}</span>}</span>
                    <ChevronRight size={16} className="text-[var(--color-label-3)]" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
