"use client";
import { useEffect, useState } from "react";
import { Minus, Plus, Leaf, Drumstick, Check } from "lucide-react";
import { Button, Sheet, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { defaultVariant, linePrice, optionProblem, type Addon, type AddonGroup, type Optioned, type Variant } from "@dineflow/shared";

/**
 * The question a dish asks before it goes on a ticket: which size, which extras, how many. Used by
 * the till and by the guest's storefront alike, so the two doors ask in the same words. The rules —
 * a group's minimum and maximum — are the ones price_line() enforces on the server; here they only
 * stop the button, so a waiter is never told "no" after pressing Send.
 */
export function OptionChooser({ item, onClose, onAdd, initialQty = 1, initialNote = "", withNote = true, verb = "Add" }:
  { item: Optioned | null; onClose: () => void; onAdd: (variant: Variant | null, addons: Addon[], qty: number, note: string) => void;
    initialQty?: number; initialNote?: string; withNote?: boolean; verb?: string }) {
  const [variant, setVariant] = useState<Variant | null>(null);
  const [picked, setPicked] = useState<Addon[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  useEffect(() => { if (item) { setVariant(defaultVariant(item)); setPicked([]); setQty(initialQty); setNote(initialNote); } }, [item, initialQty, initialNote]);
  const problem = item ? optionProblem(item, picked) : null;
  const unit = item ? linePrice(item, variant, picked) : 0;
  const toggle = (g: AddonGroup, a: Addon) => setPicked((p) => {
    if (p.some((x) => x.id === a.id)) return p.filter((x) => x.id !== a.id);
    const inGroup = p.filter((x) => g.addons.some((y) => y.id === x.id));
    if (g.max === 1) return [...p.filter((x) => !g.addons.some((y) => y.id === x.id)), a];   // pick-one: the new choice replaces the old
    if (g.max > 0 && inGroup.length >= g.max) return p;                                      // capped: the extra tap does nothing
    return [...p, a];
  });
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.name ?? ""}>
      {item && (
        <div className="space-y-5">
          {item.is_combo && (item.components?.length ?? 0) > 0 && (
            <p className="text-sm text-steel">Comes with {item.components!.map((c) => `${c.qty}× ${c.name}`).join(", ")}.</p>
          )}
          {(item.variants?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">Size</div>
              <div className="grid grid-cols-2 gap-2">
                {item.variants!.map((v) => (
                  <button key={v.id} type="button" onClick={() => setVariant(v)} aria-pressed={variant?.id === v.id}
                    className={cn("h-11 rounded-xl border px-3 flex items-center justify-between text-sm font-semibold transition", variant?.id === v.id ? "border-ink bg-ink text-on-label" : "border-line hover:bg-porcelain")}>
                    <span className="truncate">{v.name}</span><span className="num">{formatINR(Number(v.price))}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(item.addon_groups ?? []).map((g) => (
            <div key={g.id}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-steel">{g.name}</div>
                <div className="text-[11px] text-steel">{g.min > 0 ? (g.max === 1 ? "pick one" : `pick at least ${g.min}`) : g.max > 0 ? `up to ${g.max}` : "optional"}</div>
              </div>
              <div className="space-y-1.5">
                {g.addons.map((a) => {
                  const on = picked.some((x) => x.id === a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => toggle(g, a)} aria-pressed={on}
                      className={cn("w-full h-11 rounded-xl border px-3 flex items-center gap-2.5 text-sm transition", on ? "border-saffron bg-saffron/10" : "border-line hover:bg-porcelain")}>
                      <span className={cn("h-5 w-5 rounded-md border grid place-items-center shrink-0", on ? "bg-saffron border-saffron text-on-tint" : "border-line")}>{on && <Check size={13} />}</span>
                      {a.is_veg === false ? <Drumstick size={13} className="text-chili shrink-0" /> : a.is_veg === true ? <Leaf size={13} className="text-mint shrink-0" /> : null}
                      <span className="flex-1 text-left truncate font-medium">{a.name}</span>
                      <span className="num text-steel">{Number(a.price) > 0 ? `+${formatINR(Number(a.price))}` : "free"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {withNote && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the kitchen (less spicy…)" maxLength={120} />}
          {problem && <p className="text-xs font-semibold text-[var(--color-orange)]">{problem}</p>}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-11 w-11 rounded-xl border border-line grid place-items-center" aria-label="Fewer"><Minus size={16} /></button>
              <span className="num w-8 text-center font-semibold">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} className="h-11 w-11 rounded-xl border border-line grid place-items-center" aria-label="More"><Plus size={16} /></button>
            </div>
            <Button size="lg" className="flex-1" disabled={!!problem} onClick={() => { onAdd(variant, picked, qty, note.trim()); onClose(); }}>
              {verb} · {formatINR(unit * qty)}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
