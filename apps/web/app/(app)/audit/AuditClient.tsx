"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, Boxes, ChefHat, ClipboardList, Lock, Search, Settings2, Users } from "lucide-react";
import { Card, Segmented, cn } from "@/components/ui";
import { Rail } from "@/components/ui/Rail";
import { formatINR, todayIST } from "@/lib/format";

export type Event = { id: number; at: string; actor: string | null; action: string; target_type: string; target_id: string | null; label: string | null; reason: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; amount: number | null };

/** What each action is called on the screen, and which family it belongs to. */
const ACTION: Record<string, { title: string; group: Group }> = {
  "bill.void": { title: "Bill voided", group: "money" }, "bill.refund": { title: "Bill refunded", group: "money" }, "discount.give": { title: "Discount given", group: "money" }, "payment.take": { title: "Payment taken", group: "money" },
  "charge.add": { title: "Charge added", group: "money" },   // 0150: a charge on a guest's folio
  "cash.in": { title: "Cash in", group: "money" }, "cash.out": { title: "Cash out", group: "money" }, "shift.close": { title: "Shift closed", group: "money" }, "day.close": { title: "Day closed", group: "money" },
  "order.cancel": { title: "Order cancelled", group: "orders" }, "order.merge": { title: "Order merged", group: "orders" }, "line.cancel": { title: "Dish cancelled", group: "orders" },
  "stock.adjust": { title: "Stock adjusted", group: "stock" }, "stock.waste": { title: "Wastage logged", group: "stock" }, "stock.opening": { title: "Opening stock", group: "stock" }, "po.status": { title: "Purchase order", group: "stock" },
  "menu.price": { title: "Price changed", group: "menu" }, "menu.availability": { title: "Availability changed", group: "menu" }, "menu.active": { title: "Dish on/off the menu", group: "menu" },
  "staff.access": { title: "Staff access changed", group: "people" }, "settings.change": { title: "Settings changed", group: "people" },
  // 0141: Display lock — a page allowed or not, a device locked or released (the reason column names who released it)
  "display.allow": { title: "Display lock on", group: "people" }, "display.disallow": { title: "Display lock off", group: "people" }, "display.lock": { title: "Display locked", group: "people" }, "display.release": { title: "Display released", group: "people" },
};
type Group = "money" | "orders" | "stock" | "menu" | "people";
const GROUPS: { key: Group | "all"; label: string; Icon: typeof Banknote }[] = [
  { key: "all", label: "All", Icon: ClipboardList }, { key: "money", label: "Money", Icon: Banknote }, { key: "orders", label: "Orders", Icon: ClipboardList },
  { key: "stock", label: "Stock", Icon: Boxes }, { key: "menu", label: "Menu", Icon: ChefHat }, { key: "people", label: "People & settings", Icon: Users },
];
/** each family its colour (2026-11-02: people & settings were red, which read as an alarm on every settings change) */
const HUE: Record<Group, string> = { money: "var(--color-green)", orders: "var(--color-orange)", stock: "var(--color-blue)", menu: "var(--color-violet)", people: "var(--color-label-2)" };
/** an action whose picture is not its family's */
const ICON: Record<string, typeof Banknote> = { "settings.change": Settings2, "display.allow": Lock, "display.disallow": Lock, "display.lock": Lock, "display.release": Lock };
/** money that left — shown in red */
const OUT = new Set(["cash.out", "line.cancel", "order.cancel", "bill.void", "bill.refund", "discount.give"]);

/** a field's name as a person says it — the trail stores column names */
const KEY: Record<string, string> = {
  gstin: "GSTIN", gst_rate: "GST rate", gst_scheme: "GST scheme", gst_state_code: "GST state", service_charge_pct: "Service charge %", room_gst_rate: "Room GST",
  room_gst_rate_high: "Room GST (high)", room_gst_threshold: "Room GST above", facility_gst_rate: "Facility GST", upi_vpa: "UPI ID", upi_payee: "UPI name",
  loyalty_enabled: "Loyalty", loyalty_earn_pct: "Points earned %", loyalty_point_value: "Point value", loyalty_min_redeem: "Least to redeem", attend_radius_m: "Attendance radius (m)",
  kds_warn_minutes: "Kitchen warn after", kds_target_minutes: "Kitchen target", promise_minutes: "Promise (min)", check_in_time: "Check-in time", check_out_time: "Check-out time",
  enabled_modules: "Sections", membership_ends_at: "Membership ends", booking_slug: "Booking link", is_listed: "Listed", hk_inspect_required: "Inspect before sale",
  qty: "Quantity", unit: "Unit", kind: "Type", price: "Price", is_available: "Available", is_active: "On the menu", role: "Role", modules: "Sections", active: "Active",
};
const keyName = (k: string) => KEY[k] ?? (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");
const show = (v: unknown): string => v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "On" : "Off") : Array.isArray(v) ? (v.length ? v.join(", ") : "None") : typeof v === "object" ? JSON.stringify(v) : String(v);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
const dayHead = (d: string) => { const t = todayIST(); const y = new Date(Date.parse(t + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  return d === t ? "Today" : d === y ? "Yesterday" : new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** The change as chips: only keys that differ, "before → after", named as a person would. What the row already says is left out —
 *  the amount when it is the row's amount, a note that is the reason, and the type of a cash in / out. */
function Changes({ e }: { e: Event }) {
  const { before, after } = e;
  const keys = Object.keys(after ?? {}).filter((k) => {
    if (["bill_id", "order_id", "merged_into", "ref_type"].includes(k)) return false;
    if (show(before?.[k]) === show(after?.[k])) return false;
    if (k === "amount" && e.amount != null && Math.abs(Number(after?.[k])) === Math.abs(Number(e.amount))) return false;
    if (k === "note" && e.reason && show(after?.[k]).trim().toLowerCase() === e.reason.trim().toLowerCase()) return false;
    if (k === "kind" && (e.action === "cash.in" || e.action === "cash.out")) return false;
    return true;
  });
  if (!keys.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" data-changes>
      {keys.slice(0, 6).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 min-h-7 max-w-full px-2.5 py-1 rounded-[10px] bg-[var(--color-fill)] text-[12.5px] leading-tight" data-change={k}>
          <span className="text-[var(--color-label-2)] shrink-0">{keyName(k)}</span>
          {before && k in before && <><span className="text-[var(--color-label-3)] line-through truncate max-w-[10rem]">{show(before[k])}</span><ArrowRight size={12} className="shrink-0 text-[var(--color-label-3)]" aria-hidden /></>}
          <b className="font-semibold text-[var(--color-label)] truncate max-w-[14rem]">{k === "kind" ? show(after?.[k]).replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ") : show(after?.[k])}</b>
        </span>
      ))}
    </div>
  );
}

export function AuditClient({ events, names, days, more, error }: { events: Event[]; names: Record<string, string>; days: number; more: boolean; error: string | null }) {
  const router = useRouter();
  const [group, setGroup] = useState<Group | "all">("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => (group === "all" || (ACTION[e.action]?.group ?? "people") === group)
      && (!needle || [e.label, e.reason, ACTION[e.action]?.title, e.action, e.actor ? names[e.actor] : "Master control"].some((x) => (x ?? "").toLowerCase().includes(needle))));
  }, [events, group, q, names]);
  /* newest first, so a day's rows are already together — one head per IST day */
  const byDay = useMemo(() => rows.reduce<[string, Event[]][]>((g, e) => { const d = istDay(e.at); const last = g[g.length - 1]; if (last && last[0] === d) last[1].push(e); else g.push([d, [e]]); return g; }, []), [rows]);
  const counts = events.reduce<Record<string, number>>((m, e) => { const g = ACTION[e.action]?.group ?? "people"; m[g] = (m[g] ?? 0) + 1; return m; }, {});
  return (
    <div className="space-y-4" data-audit>
      {/* one filter bar: the window, the kinds on a rail that scrolls instead of wrapping, the search —
          stacked on a phone, one row from lg; it was three loose rows of pills */}
      <Card className="!p-3 sm:!p-4" data-filters>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div data-period className="shrink-0">
            <Segmented value={String(days)} onChange={(v) => router.push(`/audit?days=${v}`)} className="w-full sm:w-auto [&>button]:flex-1 [&>button]:min-w-0 [&>button]:whitespace-nowrap max-sm:[&>button]:!px-1.5 max-sm:[&>button]:!text-[13px] sm:[&>button]:flex-none" data-period
              options={[{ value: "1", label: "Today" }, { value: "7", label: "7 days" }, { value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
          </div>
          <Rail className="rail-fade flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-1 px-1 py-0.5" arrowClassName="!bottom-0.5" label="Kind">
            {/* shrink-0: as a flex item of the rail this box shrank to the rail's width and the chips spilled
                out of it, so the spacer that keeps the last chip clear of the arrow sat under the chips — at
                the end "People & settings" stopped under the arrow and the fade, half hidden */}
            <div className="flex gap-2 shrink-0" role="tablist" aria-label="Kind" data-kinds>
              {GROUPS.map(({ key, label, Icon }) => (
                <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => setGroup(key)} className={cn("chip shrink-0 whitespace-nowrap", group === key && "on")} data-group={key}>
                  <Icon size={13} /> {label}{key !== "all" && counts[key] ? <span className={cn("num text-[11px] rounded-full px-1.5 py-px", group === key ? "bg-white/20" : "bg-[var(--color-bg-2)] text-[var(--color-label-2)]")}>{counts[key]}</span> : null}
                </button>
              ))}
            </div>
          </Rail>
          <label className="relative block w-full lg:w-72 lg:ml-auto shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill, dish, name, reason" aria-label="Search the trail" className="!pl-9 w-full min-w-0" data-search />
          </label>
        </div>
      </Card>
      {error && <p className="rounded-xl bg-[var(--color-red-2)] px-4 py-3 text-sm text-[var(--color-red)]">{error}</p>}
      {rows.length === 0 ? <Card><p className="p-4 text-center text-sm text-steel">{events.length === 0 ? `Nothing in ${days === 1 ? "1 day" : `${days} days`}` : "Nothing matches."}</p></Card> : (
        /* The rows (2026-11-02, the owner: "messy — ultra modern, user friendly"). It was one list of raw column names in the
           narrow number font ("kind out amount 1000", "qty 5 note demo opening stock unit kg"), a bare "charge.add", and the
           date on every line. Now the day is a heading with its count, and each event is a card: its family's icon tile, what
           happened and to what, the reason as a quote, the changes as named chips (before struck through → after), and who —
           an initial and a name — with the time; the amount on the right, red when money left. */
        <div className="space-y-5" data-audit-days>
          {byDay.map(([d, items]) => (
            <section key={d} data-audit-day={d}>
              <div className="flex items-center gap-3 px-1 mb-2">
                <span className="text-[12px] font-extrabold uppercase tracking-[.12em] text-[var(--color-label-2)]">{dayHead(d)}</span>
                <span className="h-px flex-1 bg-[var(--color-separator)]" aria-hidden />
                <span className="text-[12px] font-semibold text-steel"><span className="num">{items.length}</span> {items.length === 1 ? "event" : "events"}</span>
              </div>
              <ul className="space-y-2">
                {items.map((e) => {
                  const a = ACTION[e.action] ?? { title: (e.action.charAt(0).toUpperCase() + e.action.slice(1)).replace(/[._]/g, " "), group: "people" as Group };
                  const G = ICON[e.action] ?? GROUPS.find((g) => g.key === a.group)!.Icon; const hue = HUE[a.group];
                  const who = e.actor ? names[e.actor] ?? "Master control" : "Server · sync";
                  const amt = e.amount != null && Number(e.amount) !== 0 ? Number(e.amount) : null;
                  return (
                    <li key={e.id} data-event data-action={e.action} style={{ ["--hue" as string]: hue }}
                      className="relative flex items-start gap-3 min-w-0 rounded-[20px] bg-[var(--color-bg-2)] ring-1 ring-[var(--color-separator)] p-3.5 sm:p-4 overflow-hidden">
                      <span aria-hidden className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-[var(--hue)] opacity-70" />
                      <span className="h-10 w-10 shrink-0 rounded-[13px] grid place-items-center bg-[color-mix(in_srgb,var(--hue)_15%,transparent)] text-[var(--hue)]" aria-hidden><G size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-bold leading-snug">{a.title}</div>
                            {e.label && <div className="text-[13px] text-[var(--color-label-2)] leading-snug truncate" title={e.label}>{e.label}</div>}
                          </div>
                          {amt != null && <div className={cn("shrink-0 num text-[15px] font-bold pt-px", OUT.has(e.action) ? "text-[var(--color-red)]" : "text-[var(--color-label)]")} data-amount>
                            {e.action === "menu.price" ? (amt > 0 ? "+" : "−") + formatINR(Math.abs(amt), { whole: true }) : (OUT.has(e.action) ? "−" : "") + formatINR(Math.abs(amt))}
                          </div>}
                        </div>
                        {e.reason && <div className="mt-2 text-[13px] leading-snug text-[var(--color-label)] border-l-2 border-[color-mix(in_srgb,var(--hue)_55%,transparent)] pl-2.5 line-clamp-2" data-reason>“{e.reason}”</div>}
                        <Changes e={e} />
                        <div className="mt-2.5 flex items-center gap-2 min-w-0 text-[12px] text-steel">
                          <span className="h-5 w-5 shrink-0 rounded-full grid place-items-center text-[9.5px] font-bold bg-[var(--color-fill)] text-[var(--color-label-2)]" aria-hidden>{initials(who)}</span>
                          <span className="truncate font-semibold text-[var(--color-label-2)]">{who}</span>
                          <span aria-hidden>·</span>
                          <span className="num shrink-0">{time(e.at)}</span>
                        </div>
                      </div>
                    </li>);
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {more && rows.length > 0 && <div className="text-center"><Link href={`/audit?days=${days}&before=${events[events.length - 1].id}`} className="btn btn-gray !h-11 px-5 inline-flex items-center text-sm font-semibold">Older</Link></div>}
      <p className="text-[11.5px] text-steel flex items-center gap-1.5"><Settings2 size={12} /> Owner, managers, supervisors</p>
    </div>
  );
}
