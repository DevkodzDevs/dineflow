"use client";
import { useState, useTransition } from "react";
import { Camera, Loader2, Leaf, Drumstick } from "lucide-react";
import { Button, Pill, cn, useToast } from "@/components/ui";
import { photoToDataUrl } from "@/lib/photo";
import { readMenuPhoto, importDishes, type ImportDish } from "./actions";

type Row = ImportDish & { keep: boolean };

/**
 * A printed or handwritten menu, photographed, becomes dishes — Lightspeed's "set up a menu from a
 * photo". The model only reads; the owner ticks what to keep, fixes a name or a price, and Add is the
 * only thing that writes. A dish the menu already has (same name) starts unticked.
 */
export function MenuImport({ existing, onDone }: { existing: string[]; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sample, setSample] = useState(false);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const have = new Set(existing.map((n) => n.trim().toLowerCase()));

  const read = async (file: File) => {
    setErr(null); setReading(true);
    try {
      const r = await readMenuPhoto(await photoToDataUrl(file, 2000));
      if ("error" in r) { setErr(r.error); return; }
      setSample(!!r.sample);
      setRows(r.dishes.map((d) => ({ ...d, keep: !have.has(d.name.trim().toLowerCase()) })));
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that photo."); }
    finally { setReading(false); }
  };
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const kept = rows?.filter((r) => r.keep) ?? [];

  return (
    <div className="space-y-4">
      <label className={cn("flex items-center gap-3 rounded-2xl border border-dashed p-3.5 cursor-pointer transition-colors", reading ? "border-[var(--color-tint)] bg-[var(--color-green-2)]" : "border-[var(--color-label-3)] hover:bg-[var(--color-fill)]")}>
        <span className="h-11 w-11 rounded-xl grid place-items-center shrink-0 bg-[var(--color-fill)] text-[var(--color-tint)]">{reading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold">{reading ? "Reading the menu…" : rows ? "Read another page" : "Photograph your menu"}</span>
          <span className="block text-xs text-[var(--color-label-2)]">A printed or handwritten menu, one page at a time. You check every dish before it is added.</span>
        </span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={reading}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void read(f); }} />
      </label>
      {err && <p className="text-sm text-chili">{err}</p>}

      {rows && (<>
        <div className="flex items-center gap-2 text-xs">
          <b className="text-[13px]">{rows.length} dish{rows.length === 1 ? "" : "es"} read</b>{sample && <Pill tone="gold">sample</Pill>}
          <button type="button" className="ml-auto h-9 px-2 font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)]" onClick={() => setRows(rows.map((r) => ({ ...r, keep: !rows.every((x) => x.keep) })))}>{rows.every((x) => x.keep) ? "Untick all" : "Tick all"}</button>
        </div>
        {sample && <p className="text-xs text-[var(--color-label-2)] -mt-2">Sample mode: add ANTHROPIC_API_KEY on the server to read real menus.</p>}
        <div className="rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden">
          {rows.map((r, i) => {
            const dup = have.has(r.name.trim().toLowerCase());
            return (
              <div key={i} className={cn("flex items-center gap-2.5 p-2.5 pl-3", !r.keep && "opacity-55")}>
                <input type="checkbox" checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} aria-label={`Keep ${r.name}`} />
                <button type="button" onClick={() => set(i, { is_veg: !r.is_veg })} title={r.is_veg ? "Veg — tap to change" : "Non-veg — tap to change"}
                  className={cn("h-9 w-9 rounded-lg grid place-items-center shrink-0", r.is_veg ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]")}>{r.is_veg ? <Leaf size={14} /> : <Drumstick size={14} />}</button>
                <span className="flex-1 min-w-0">
                  <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="!min-h-0 !py-1.5 !px-2 !text-[14px] font-semibold" />
                  <span className="block text-[11px] text-[var(--color-label-2)] px-2 mt-0.5 truncate">{r.category || "No section"}{dup ? " · already on your menu" : ""}</span>
                </span>
                <input type="number" min={0} value={r.price || ""} onChange={(e) => set(i, { price: Number(e.target.value) })} className="num !w-20 !min-h-0 !py-1.5 !px-2 !text-[14px] text-right" aria-label={`Price of ${r.name}`} />
              </div>
            );
          })}
        </div>
        <Button className="w-full" disabled={pending || kept.length === 0} onClick={() => start(async () => {
          const r = await importDishes(kept.map(({ keep: _k, ...d }) => d));
          if ("error" in r) { setErr(r.error ?? "Could not add"); return; }
          toast(`${r.added} dish${r.added === 1 ? "" : "es"} added to the menu`); onDone();
        })}>{pending ? "Adding…" : `Add ${kept.length} dish${kept.length === 1 ? "" : "es"}`}</Button>
      </>)}
    </div>
  );
}
