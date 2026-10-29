"use client";
import { useMemo, useState, useTransition } from "react";
import { Globe, Search, Lock, ChevronRight } from "lucide-react";
import { formatINR } from "@dineflow/shared";
import { Sheet, Switch, cn, useToast } from "@/components/ui";
import { setOnlineAvailable } from "./actions";

export type OnlineDish = { id: string; name: string; price: number; is_veg: boolean; is_available: boolean; online_available: boolean; category: string | null };
type Filter = "all" | "off" | "sold";

/**
 * Dishes online (2026-10-22, 0132 — the owner: "set which dishes are available online, by the chef, the manager and the
 * online-orders supervisors"). A card at the top of Online orders says how many dishes are off online; it opens a sheet
 * with every dish under its category and a switch each. Off online: Swiggy, Zomato and the website stop selling it — the
 * till and the table QR still do. Sold out (Menu) stops it everywhere, so those rows are shown, not switched. Who may
 * switch is `canSetOnline` (lib/online.ts, the same rule as the RPC); anyone else sees the list read-only.
 */
export function OnlineDishes({ dishes, canEdit }: { dishes: OnlineDish[]; canEdit: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [filter, setFilter] = useState<Filter>("all");
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(dishes.map((d) => [d.id, d.online_available])));
  const [, start] = useTransition();
  const isOn = (d: OnlineDish) => on[d.id] ?? d.online_available;
  const off = dishes.filter((d) => d.is_available && !isOn(d)).length, sold = dishes.filter((d) => !d.is_available).length;

  const set = (ids: string[], v: boolean) => {
    const before = { ...on }; setOn((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, v])) }));
    start(async () => {
      const r = await setOnlineAvailable(ids, v);
      if ("error" in r) { setOn(before); toast(r.error!, "err"); return; }
      if (ids.length > 1) toast(v ? "All dishes are online again" : `${ids.length} dishes off online`);
    });
  };

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const rows = dishes.filter((d) => (!t || d.name.toLowerCase().includes(t)) && (filter === "all" || (filter === "off" ? d.is_available && !isOn(d) : !d.is_available)));
    const by = new Map<string, OnlineDish[]>(); for (const d of rows) { const k = d.category ?? "Other"; by.set(k, [...(by.get(k) ?? []), d]); }
    return [...by.entries()];
  }, [dishes, q, filter, on]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (k: Filter, label: string, n?: number) => (
    <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k} data-online-filter={k}
      className={cn("h-11 px-4 rounded-full text-[14px] font-bold inline-flex items-center gap-2 shrink-0 transition-colors", filter === k ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")}>
      {label}{n != null && <span className="num text-[12px] opacity-80">{n}</span>}
    </button>
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-online-dishes
        className="w-full text-left rounded-[20px] p-3.5 flex items-center gap-3 bg-[var(--color-bg-2)] border border-[var(--color-separator)] hover:bg-[var(--color-fill)] transition-colors">
        <span className={cn("h-11 w-11 shrink-0 rounded-[14px] grid place-items-center", off ? "bg-[color-mix(in_srgb,var(--color-orange)_16%,transparent)] text-[var(--color-orange)]" : "bg-[color-mix(in_srgb,var(--color-tint)_16%,transparent)] text-[var(--color-tint)]")}><Globe size={20} aria-hidden /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-extrabold">Dishes online</span>
          <span className="block text-[13px] text-[var(--color-label-2)] truncate" data-online-summary>
            {off ? `${off} off online` : "All dishes online"}{sold ? ` · ${sold} sold out` : ""}
          </span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-label-2)]">{canEdit ? "Manage" : "View"}<ChevronRight size={16} aria-hidden /></span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Dishes online">
        <div className="space-y-4" data-online-sheet>
          <p className="text-[14px] text-[var(--color-label-2)]">Off = in-house only</p>
          {!canEdit && <p className="flex items-center gap-2 rounded-2xl bg-[var(--color-fill)] px-3.5 py-3 text-[13.5px]" data-online-locked><Lock size={15} aria-hidden className="shrink-0" />Chef, manager or online supervisor only.</p>}
          <label className="flex items-center gap-2 h-12 rounded-2xl bg-[var(--color-fill)] px-3.5">
            <Search size={17} aria-hidden className="text-[var(--color-label-3)] shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a dish" className="flex-1 min-w-0 !bg-transparent !border-0 !shadow-none !ring-0 !outline-none !px-0 !min-h-0 !h-full !rounded-none text-[15px]" data-online-search />
          </label>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">{chip("all", "All", dishes.length)}{chip("off", "Off online", off)}{chip("sold", "Sold out", sold)}</div>
          {groups.length === 0 && <p className="text-[14px] text-[var(--color-label-2)] text-center py-8">{filter === "off" ? "Every dish is online." : filter === "sold" ? "Nothing is sold out." : "No dish matches."}</p>}
          {groups.map(([cat, list]) => (
            <section key={cat}>
              <h3 className="text-[12px] font-bold uppercase tracking-[.12em] text-[var(--color-label-3)] mb-2">{cat}</h3>
              <ul className="rounded-[18px] border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden">
                {list.map((d) => {
                  const live = d.is_available && isOn(d);
                  return (
                    <li key={d.id} className="flex items-center gap-3 px-3.5 min-h-14 py-2" data-online-dish={d.name} data-online={d.is_available ? String(isOn(d)) : "sold"}>
                      <span className={cn("h-3.5 w-3.5 shrink-0 rounded-[3px] border-2 grid place-items-center", d.is_veg ? "border-[var(--color-green)]" : "border-[var(--color-red)]")} aria-label={d.is_veg ? "Veg" : "Non-veg"}><span className={cn("h-1.5 w-1.5 rounded-full", d.is_veg ? "bg-[var(--color-green)]" : "bg-[var(--color-red)]")} /></span>
                      <span className="flex-1 min-w-0">
                        <span className={cn("block text-[15px] font-semibold truncate", !live && "text-[var(--color-label-2)]")}>{d.name}</span>
                        <span className="block text-[12.5px] text-[var(--color-label-3)] num">{formatINR(Number(d.price), { whole: true })}{!d.is_available ? " · sold out — turn on in Menu" : !isOn(d) ? " · off online" : ""}</span>
                      </span>
                      {d.is_available
                        ? (canEdit ? <Switch on={isOn(d)} onChange={(v) => set([d.id], v)} name={`${d.name} online`} /> : <span className={cn("text-[12.5px] font-bold", isOn(d) ? "text-[var(--color-green)]" : "text-[var(--color-orange)]")}>{isOn(d) ? "Online" : "Off"}</span>)
                        : <span className="text-[12.5px] font-bold text-[var(--color-red)]">Sold out</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex gap-2 pt-1">
            {canEdit && off > 0 && <button type="button" className="btn btn-tinted !h-12 flex-1" onClick={() => set(dishes.filter((d) => d.is_available && !isOn(d)).map((d) => d.id), true)} data-online-all-on>Turn all on</button>}
            <button type="button" className="btn btn-filled !h-12 flex-1" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
