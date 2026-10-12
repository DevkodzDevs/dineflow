"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Boxes, ChefHat, ClipboardList, Search, Settings2, Users } from "lucide-react";
import { Card, Segmented, cn } from "@/components/ui";
import { Rail } from "@/components/ui/Rail";
import { formatINR } from "@/lib/format";

export type Event = { id: number; at: string; actor: string | null; action: string; target_type: string; target_id: string | null; label: string | null; reason: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; amount: number | null };

/** What each action is called on the screen, and which family it belongs to. */
const ACTION: Record<string, { title: string; group: Group }> = {
  "bill.void": { title: "Bill voided", group: "money" }, "discount.give": { title: "Discount given", group: "money" }, "payment.take": { title: "Payment taken", group: "money" },
  "cash.in": { title: "Cash in", group: "money" }, "cash.out": { title: "Cash out", group: "money" }, "shift.close": { title: "Shift closed", group: "money" }, "day.close": { title: "Day closed", group: "money" },
  "order.cancel": { title: "Order cancelled", group: "orders" }, "order.merge": { title: "Order merged", group: "orders" }, "line.cancel": { title: "Dish cancelled", group: "orders" },
  "stock.adjust": { title: "Stock adjusted", group: "stock" }, "stock.waste": { title: "Wastage logged", group: "stock" }, "stock.opening": { title: "Opening stock", group: "stock" }, "po.status": { title: "Purchase order", group: "stock" },
  "menu.price": { title: "Price changed", group: "menu" }, "menu.availability": { title: "Availability changed", group: "menu" }, "menu.active": { title: "Dish on/off the menu", group: "menu" },
  "staff.access": { title: "Staff access changed", group: "people" }, "settings.change": { title: "Settings changed", group: "people" },
};
type Group = "money" | "orders" | "stock" | "menu" | "people";
const GROUPS: { key: Group | "all"; label: string; Icon: typeof Banknote }[] = [
  { key: "all", label: "All", Icon: ClipboardList }, { key: "money", label: "Money", Icon: Banknote }, { key: "orders", label: "Orders", Icon: ClipboardList },
  { key: "stock", label: "Stock", Icon: Boxes }, { key: "menu", label: "Menu", Icon: ChefHat }, { key: "people", label: "People & settings", Icon: Users },
];
const TONE: Record<Group, string> = {
  money: "bg-[var(--color-green-2)] text-[var(--color-green)]", orders: "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]",
  stock: "bg-[var(--color-fill)] text-[var(--color-label)]", menu: "bg-[var(--color-fill)] text-[var(--color-label)]", people: "bg-[var(--color-red-2)] text-[var(--color-red)]",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const show = (v: unknown): string => v == null ? "—" : typeof v === "boolean" ? (v ? "on" : "off") : Array.isArray(v) ? (v.length ? v.join(", ") : "none") : typeof v === "object" ? JSON.stringify(v) : String(v);

/** The change in a line: only keys that differ, "before → after". */
function Diff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  // only what is in `after`: a void's `before` carries the total for the record, but "total 147 → —" would read as a change
  const keys = Object.keys(after ?? {}).filter((k) => !["bill_id", "order_id", "merged_into", "ref_type"].includes(k) && show(before?.[k]) !== show(after?.[k]));
  if (!keys.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-[var(--color-label-2)]">
      {keys.slice(0, 6).map((k) => <span key={k} className="num"><span className="text-[var(--color-label-3)]">{k.replace(/_/g, " ")}</span> {before && k in before ? <>{show(before[k])} → </> : null}<b className="text-[var(--color-label)] font-semibold">{show(after?.[k])}</b></span>)}
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
            <div className="flex gap-2" role="tablist" aria-label="Kind" data-kinds>
              {GROUPS.map(({ key, label, Icon }) => (
                <button key={key} type="button" role="tab" aria-selected={group === key} onClick={() => setGroup(key)} className={cn("chip shrink-0 whitespace-nowrap", group === key && "on")} data-group={key}>
                  <Icon size={13} /> {label}{key !== "all" && counts[key] ? <span className={cn("num text-[11px] rounded-full px-1.5 py-px", group === key ? "bg-white/20" : "bg-[var(--color-bg-2)] text-[var(--color-label-2)]")}>{counts[key]}</span> : null}
                </button>
              ))}
            </div>
          </Rail>
          <label className="relative block w-full lg:w-72 lg:ml-auto shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a bill, a dish, a name, a reason" aria-label="Search the trail" className="!pl-9 w-full min-w-0" data-search />
          </label>
        </div>
      </Card>
      {error && <p className="rounded-xl bg-[var(--color-red-2)] px-4 py-3 text-sm text-[var(--color-red)]">{error}</p>}
      <Card className="!p-0 overflow-hidden">
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-steel">{events.length === 0 ? `Nothing recorded in the last ${days === 1 ? "day" : `${days} days`}. The trail starts with the first void, discount, payment, stock change or settings change after this update.` : "Nothing matches."}</p> : (
          <ul className="divide-y divide-[var(--color-separator)]">
            {rows.map((e) => { const a = ACTION[e.action] ?? { title: e.action, group: "people" as Group }; const G = GROUPS.find((g) => g.key === a.group)!.Icon; return (
              <li key={e.id} className="px-4 py-3 flex items-start gap-3 min-w-0" data-event data-action={e.action}>
                <span className={cn("h-9 w-9 shrink-0 rounded-xl grid place-items-center mt-0.5", TONE[a.group])}><G size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 min-w-0"><span className="text-sm font-semibold truncate">{a.title}</span>{e.label && <span className="text-sm text-[var(--color-label-2)] truncate">· {e.label}</span>}</div>
                  {e.reason && <div className="text-[13px] mt-0.5 truncate">“{e.reason}”</div>}
                  <Diff before={e.before} after={e.after} />
                  <div className="text-[11.5px] text-steel mt-1 truncate">{e.actor ? names[e.actor] ?? "Master control" : "Server · sync"} · <span className="num">{when(e.at)}</span></div>
                </div>
                {e.amount != null && Number(e.amount) !== 0 && <div className={cn("num text-sm font-semibold shrink-0", e.action === "cash.out" || e.action === "line.cancel" || e.action === "order.cancel" || e.action === "bill.void" ? "text-chili" : "")}>{e.action === "menu.price" ? (Number(e.amount) > 0 ? "+" : "−") + formatINR(Math.abs(Number(e.amount)), { whole: true }) : formatINR(Number(e.amount))}</div>}
              </li>); })}
          </ul>
        )}
      </Card>
      {more && rows.length > 0 && <div className="text-center"><Link href={`/audit?days=${days}&before=${events[events.length - 1].id}`} className="btn btn-gray !h-11 px-5 inline-flex items-center text-sm font-semibold">Older</Link></div>}
      <p className="text-[11.5px] text-steel flex items-center gap-1.5"><Settings2 size={12} /> Readable by the owner, managers and supervisors. Written by database triggers on every path — the till, the kitchen screen, the phone app, the Box and the server.</p>
    </div>
  );
}
