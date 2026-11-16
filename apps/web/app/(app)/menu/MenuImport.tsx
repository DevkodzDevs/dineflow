"use client";
import { useMemo, useState, useTransition } from "react";
import { Camera, Images, Loader2, Leaf, Drumstick, Check, X, Flame, Plus, FlaskConical } from "lucide-react";
import { Button, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { photoToDataUrl } from "@/lib/photo";
import { mergePhotos, findExisting, newCategories, normName, GST_RATES, type ImportDish, type ImportVariant, type ExistingDish } from "@/lib/menuImport";
import { readMenuPhoto, importDishes, autoRecipes } from "./actions";
import { importProgress } from "@/lib/touches";

type Row = ImportDish & { keep: boolean; dup: ExistingDish | null; open: boolean };
type Page = { id: number; label: string; status: "reading" | "done" | "error"; n?: number; error?: string };
type Result = { added: number; updated: number; skipped: number };

/**
 * "Menu photo to a working POS in two minutes" (2026-11-09). A printed or handwritten menu card, photographed page
 * by page — several at once from the gallery, or one shot after another from the camera — becomes dishes the
 * owner ticks and fixes: name (and the name as printed when it was in Tamil or Hindi), section, price or sizes,
 * veg, GST, spicy / Jain. Each photo is read in parallel (`readMenuPhoto`, one call a photo) and the pages are
 * merged (`mergePhotos`): the same dish twice is one row, the surer reading keeps the price. The model only reads;
 * *Add* is the only write (`importDishes`), and a dish already on the menu starts unticked — ticked, it updates the
 * price. Afterwards one button attaches the library's standard recipes (`autoRecipes`) so food cost exists from day one.
 */
export function MenuImport({ existing, categories, gstRate, onDone }: { existing: ExistingDish[]; categories: string[]; gstRate: number; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [recipes, setRecipes] = useState<{ busy: boolean; done?: number; created?: number; unknown?: number } | null>(null);
  const [pending, start] = useTransition();
  const reading = pages.some((p) => p.status === "reading");
  const [drag, setDrag] = useState(false);   // a desktop dragging photos over the zone
  const moons = pages.filter((p) => p.status === "reading").slice(0, 3);
  const progress = importProgress(pages); const RING = 2 * Math.PI * 35;

  const mark = (id: number, patch: Partial<Page>) => setPages((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  /** Every photo at once, each its own call; the pages are merged into the rows already read, keeping the owner's ticks and edits. */
  const read = async (files: File[]) => {
    if (!files.length) return;
    setErr(null);
    const first = Date.now();
    const batch = files.map((f, i) => ({ id: first + i, file: f, label: `Photo ${pages.length + i + 1}` }));
    setPages((ps) => [...ps, ...batch.map(({ id, label }) => ({ id, label, status: "reading" as const }))]);
    const outcomes = await Promise.all(batch.map(async ({ id, file }): Promise<{ dishes: ImportDish[]; error?: string }> => {
      try {
        const r = await readMenuPhoto(await photoToDataUrl(file, 2000));
        if ("error" in r) { mark(id, { status: "error", error: r.error }); return { dishes: [], error: r.error }; }
        mark(id, { status: "done", n: r.dishes.length }); return { dishes: r.dishes };
      } catch (e) { const error = e instanceof Error ? e.message : "Could not read that photo."; mark(id, { status: "error", error }); return { dishes: [], error }; }
    }));
    // every photo failed: say why once, under the pickers (one bad page among good ones shows on its own pill)
    if (outcomes.every((o) => o.error)) setErr(outcomes[0].error ?? null);
    const results = outcomes.map((o) => o.dishes);
    if (!results.some((r) => r.length) && !rows) return;
    setRows((prev) => {
      const before = new Map((prev ?? []).map((r) => [normName(r.name), r]));
      return mergePhotos([prev ?? [], ...results]).map((d) => {
        const was = before.get(normName(d.name)); const dup = findExisting(d, existing);
        return { ...d, dup, keep: was ? was.keep : !dup, open: was?.open ?? false };
      });
    });
  };
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, ...patch, confidence: 1 } : r)));
  const setVariant = (i: number, k: number, patch: Partial<ImportVariant> | null) => setRows((rs) => rs && rs.map((r, j) => {
    if (j !== i) return r;
    const variants = patch === null ? r.variants.filter((_v, x) => x !== k) : r.variants.map((v, x) => (x === k ? { ...v, ...patch } : v));
    return { ...r, variants, price: variants.length >= 2 ? Math.min(...variants.map((v) => v.price || 0)) : r.price, confidence: 1 };
  }));
  const kept = rows?.filter((r) => r.keep) ?? [];
  const adds = kept.filter((r) => !r.dup).length, updates = kept.length - adds;
  const sections = useMemo(() => [...categories, ...newCategories(rows ?? [], categories)], [rows, categories]);
  const pick = "!min-h-9 [@media(pointer:coarse)]:!min-h-11 !py-0 !px-2 !text-[12.5px] !w-auto max-w-[11rem] !rounded-lg";

  if (result) return (
    <div className="space-y-4" data-import-result>
      <div className="rounded-2xl p-4 bg-[var(--color-green-2)] flex items-start gap-3">
        <span className="h-11 w-11 rounded-xl grid place-items-center shrink-0 bg-[var(--color-bg-2)] text-[var(--color-green)]"><Check size={20} /></span>
        <span className="min-w-0">
          <b className="block text-[15px]">{result.added} dish{result.added === 1 ? "" : "es"} added</b>
          <span className="block text-sm text-[var(--color-label-2)]">{[result.updated ? `${result.updated} price${result.updated === 1 ? "" : "s"} updated` : "", result.skipped ? `${result.skipped} already on the menu` : ""].filter(Boolean).join(" · ") || "All available, on the till now."}</span>
        </span>
      </div>
      <div className="rounded-2xl border border-[var(--color-separator)] p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl grid place-items-center shrink-0 text-[var(--color-orange)]" style={{ background: "color-mix(in srgb, var(--color-orange) 16%, transparent)" }}><FlaskConical size={18} /></span>
          <span className="min-w-0"><b className="block text-[14px]">Attach standard recipes</b><span className="block text-xs text-[var(--color-label-2)]">The library's plate for every dish it knows — food cost from day one.</span></span>
        </div>
        {recipes?.done !== undefined
          ? <p className="text-sm" data-recipes-done>{recipes.done} recipe{recipes.done === 1 ? "" : "s"} attached{recipes.created ? ` · ${recipes.created} pantry line${recipes.created === 1 ? "" : "s"} added` : ""}{recipes.unknown ? ` · ${recipes.unknown} to map by hand` : ""}</p>
          : <Button variant="outline" className="w-full" disabled={recipes?.busy} data-attach-recipes onClick={() => { setRecipes({ busy: true }); void autoRecipes().then((r) => {
              if ("error" in r) { toast(r.error!, "err"); setRecipes(null); return; }
              setRecipes({ busy: false, done: r.done, created: r.created, unknown: r.unknown.length });
            }); }}>{recipes?.busy ? "Attaching…" : "Attach standard recipes"}</Button>}
      </div>
      <Button className="w-full" onClick={onDone}>Done</Button>
    </div>
  );

  return (
    <div className="space-y-4" data-menu-import>
      {/* the drop zone is a small planet (2026-11-16, the owner's video): every page still being read is a moon in orbit, the ring
          is how far along the import is; the two ways in — the camera one page at a time, the gallery several at once — are the
          same 44px targets, two across on a phone; a desktop can also drop the photos on the zone */}
      <div className={cn("orbit-zone", drag && "is-drag", reading && "is-reading")} data-orbit data-drag={drag || undefined}
        onDragOver={(e) => { e.preventDefault(); if (!pending) setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (pending) return; void read(Array.from(e.dataTransfer.files ?? []).filter((f) => f.type.startsWith("image/"))); }}>
        <div className="orbit-dust" aria-hidden>{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: `${(i * 53) % 100}%`, top: `${(i * 29) % 100}%`, opacity: 0.2 + (i % 4) * 0.15 }} />)}</div>
        <div className="orbit-sys" aria-hidden>
          <span className="orbit-ring r3" /><span className="orbit-ring r2" /><span className="orbit-ring r1" />
          {moons.map((m, i) => <span key={m.id} className={cn("orbit-moon", `m${i}`)} style={{ "--hue": ["var(--color-orange)", "var(--color-blue)", "var(--color-green)"][i] } as React.CSSProperties} />)}
          <div className="orbit-core">
            <svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="35" className="orbit-track" /><circle cx="38" cy="38" r="35" className="orbit-fill" style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - progress) }} /></svg>
            {pages.length ? <b className="num" data-orbit-pct={Math.round(progress * 100)}>{Math.round(progress * 100)}<small>%</small></b> : <Camera size={24} />}
          </div>
        </div>
        <div className="orbit-title" aria-live="polite">{reading ? `Reading ${pages.filter((p) => p.status === "reading").length} of ${pages.length} ${pages.length === 1 ? "page" : "pages"}…` : pages.length ? `${pages.filter((p) => p.status === "done").length} of ${pages.length} ${pages.length === 1 ? "page" : "pages"} read` : "Photograph the menu card, or drop the photos here"}</div>
        <div className="orbit-picks">
          {([{ k: "camera", Icon: Camera, label: rows ? "Another page" : "Take a photo", sub: "One page at a time", multiple: false },
             { k: "gallery", Icon: Images, label: "Choose photos", sub: "Front, back, every page", multiple: true }] as const).map(({ k, Icon, label, sub, multiple }) => (
            <label key={k} data-import-pick={k} className={cn("orbit-pick", pending && "is-off")}>
              <span className="orbit-pick-ic">{reading && k === "camera" ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}</span>
              <span className="flex-1 min-w-0"><b>{label}</b><small>{sub}</small></span>
              <input type="file" accept="image/*" multiple={multiple} {...(multiple ? {} : { capture: "environment" as const })} className="sr-only !w-px !h-px !min-w-0 !p-0 !border-0" disabled={pending}
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void read(fs); }} />
            </label>
          ))}
        </div>
        <p className="orbit-sub">JPG or PNG · front, back, every page · read together</p>
      </div>
      {/* one row a photo: reading (a scanning bar), read (how many dishes), or could not read */}
      {pages.length > 0 && (
        <ul className="orbit-files" aria-live="polite" data-import-pages>
          {pages.map((p) => (
            <li key={p.id} className="orbit-file" data-page-status={p.status} title={p.error}>
              <i className="orbit-file-ic">{p.status === "reading" ? <Loader2 size={14} className="animate-spin" /> : p.status === "done" ? <Check size={14} strokeWidth={3} /> : <X size={14} />}</i>
              <span className="flex-1 min-w-0"><b>{p.label}</b><small>{p.status === "done" ? `${p.n} ${p.n === 1 ? "dish" : "dishes"} found` : p.status === "error" ? "could not read" : "reading…"}</small><span className="orbit-bar"><span /></span></span>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="text-sm text-chili">{err}</p>}

      {rows && (<>
        <div className="flex items-center gap-2 text-xs">
          <b className="text-[13px]">{rows.length} dish{rows.length === 1 ? "" : "es"} read</b>
          <span className="text-[var(--color-label-2)]">· tick and fix, then add</span>
          <button type="button" className="ml-auto h-9 px-2 font-semibold text-[var(--color-label-2)] hover:text-[var(--color-label)]" onClick={() => setRows(rows.map((r) => ({ ...r, keep: !rows.every((x) => x.keep) })))}>{rows.every((x) => x.keep) ? "Untick all" : "Tick all"}</button>
        </div>
        <div className="rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)] overflow-hidden">
          {rows.map((r, i) => (
            <div key={i} className={cn("p-2.5 pl-2 space-y-1.5", !r.keep && "opacity-55")} data-import-row data-dup={r.dup ? "" : undefined}>
              <div className="flex items-center gap-2">
                <label className="h-11 w-9 grid place-items-center shrink-0 cursor-pointer"><input type="checkbox" checked={r.keep} onChange={(e) => set(i, { keep: e.target.checked })} aria-label={`Keep ${r.name}`} /></label>
                <button type="button" onClick={() => set(i, { is_veg: !r.is_veg })} title={r.is_veg ? "Veg — tap to change" : "Non-veg — tap to change"}
                  className={cn("h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 rounded-lg grid place-items-center shrink-0", r.is_veg ? "bg-[var(--color-green-2)] text-[var(--color-green)]" : "bg-[var(--color-red-2)] text-[var(--color-red)]")}>{r.is_veg ? <Leaf size={14} /> : <Drumstick size={14} />}</button>
                <span className="flex-1 min-w-0">
                  <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="!min-h-10 [@media(pointer:coarse)]:!min-h-11 !py-1.5 !px-2 !text-[14px] font-semibold" aria-label="Dish name" />
                  {(r.name_local || r.description) && <span className="block text-[11px] text-[var(--color-label-2)] px-2 mt-0.5 truncate" title={r.description || undefined}>{r.name_local ? <span lang="und">{r.name_local}</span> : null}{r.name_local && r.description ? " · " : ""}{r.description}</span>}
                </span>
                {r.variants.length >= 2
                  ? <button type="button" onClick={() => set(i, { open: !r.open })} className="num shrink-0 h-10 [@media(pointer:coarse)]:h-11 px-2 rounded-lg bg-[var(--color-fill)] text-[12.5px] font-semibold text-right leading-tight" aria-expanded={r.open} data-sizes>
                      {r.variants.length} sizes<span className="block text-[11px] font-normal text-[var(--color-label-2)]">from {formatINR(Math.min(...r.variants.map((v) => v.price || 0)), { whole: true })}</span></button>
                  : <input type="number" min={0} value={r.price || ""} onChange={(e) => set(i, { price: Number(e.target.value) })} className="num !w-20 !min-h-10 [@media(pointer:coarse)]:!min-h-11 !py-1.5 !px-2 !text-[14px] text-right" aria-label={`Price of ${r.name}`} />}
              </div>
              {/* the second line: section, GST, sizes and the flags — wraps on a phone */}
              <div className="flex flex-wrap items-center gap-1.5 pl-9">
                <select value={r.category} onChange={(e) => set(i, { category: e.target.value })} className={pick} aria-label="Section">
                  <option value="">No section</option>
                  {sections.map((c) => <option key={c} value={c}>{c}{categories.includes(c) ? "" : " (new)"}</option>)}
                  {r.category && !sections.includes(r.category) && <option value={r.category}>{r.category} (new)</option>}
                </select>
                <select value={r.gst_rate == null ? "" : String(r.gst_rate)} onChange={(e) => set(i, { gst_rate: e.target.value === "" ? null : Number(e.target.value), hsn: e.target.value === "" ? null : r.hsn })} className={pick} aria-label="GST" data-gst>
                  <option value="">GST {gstRate}%</option>
                  {GST_RATES.map((g) => <option key={g} value={g}>GST {g}%{g === 0 ? " · none" : ""}</option>)}
                </select>
                {r.gst_rate != null && <input value={r.hsn ?? ""} onChange={(e) => set(i, { hsn: e.target.value.replace(/\D/g, "").slice(0, 8) || null })} inputMode="numeric" placeholder="HSN" className={cn(pick, "num !w-20")} aria-label="HSN / SAC" />}
                {r.variants.length < 2 && <button type="button" className="h-9 [@media(pointer:coarse)]:h-11 px-2 rounded-lg text-[12px] font-semibold text-[var(--color-label-2)] hover:bg-[var(--color-fill)] inline-flex items-center gap-1" onClick={() => set(i, { variants: [{ name: "Half", price: r.price }, { name: "Full", price: r.price }], open: true })}><Plus size={13} /> Sizes</button>}
                {([["spicy", "Spicy", Flame], ["jain", "Jain", Leaf]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" aria-pressed={r[k]} onClick={() => set(i, { [k]: !r[k] } as Partial<Row>)} style={r[k] ? { background: "color-mix(in srgb, var(--color-orange) 16%, transparent)" } : undefined}
                    className={cn("h-9 [@media(pointer:coarse)]:h-11 px-2 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1", r[k] ? "text-[var(--color-orange)]" : "text-[var(--color-label-3)] hover:bg-[var(--color-fill)]")}><Icon size={13} /> {label}</button>
                ))}
                {r.dup && <span className="text-[11px] font-semibold text-[var(--color-orange)]">Already on menu at {formatINR(r.dup.price, { whole: true })}{r.keep ? " · price will update" : " · skipped"}</span>}
              </div>
              {r.open && r.variants.length > 0 && (
                <div className="pl-9 space-y-1.5" data-sizes-editor>
                  {r.variants.map((v, k) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <input value={v.name} onChange={(e) => setVariant(i, k, { name: e.target.value })} className="!min-h-10 [@media(pointer:coarse)]:!min-h-11 !py-1 !px-2 !text-[13px] flex-1 min-w-0" aria-label="Size name" />
                      <input type="number" min={0} value={v.price || ""} onChange={(e) => setVariant(i, k, { price: Number(e.target.value) })} className="num !w-20 !min-h-10 [@media(pointer:coarse)]:!min-h-11 !py-1 !px-2 !text-[13px] text-right" aria-label={`Price of ${v.name}`} />
                      <button type="button" onClick={() => setVariant(i, k, null)} className="h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 grid place-items-center rounded-lg text-[var(--color-label-3)] hover:text-[var(--color-red)]" aria-label={`Remove ${v.name}`}><X size={15} /></button>
                    </div>
                  ))}
                  <button type="button" className="h-9 px-2 rounded-lg text-[12px] font-semibold text-[var(--color-tint)] inline-flex items-center gap-1" onClick={() => set(i, { variants: [...r.variants, { name: "", price: 0 }] })}><Plus size={13} /> Add a size</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <Button className="w-full" disabled={pending || reading || kept.length === 0} data-import-add onClick={() => start(async () => {
          setErr(null);
          const r = await importDishes(kept.map(({ keep: _k, dup, open: _o, ...d }) => ({ ...d, variants: d.variants.filter((v) => v.name.trim()), mode: dup ? "update" as const : "add" as const })));
          if ("error" in r) { setErr(r.error ?? "Could not add"); return; }
          toast(`${r.added} dish${r.added === 1 ? "" : "es"} added`); setResult({ added: r.added, updated: r.updated, skipped: r.skipped });
        })}>{pending ? "Adding…" : `Add ${adds} dish${adds === 1 ? "" : "es"}${updates ? ` · update ${updates}` : ""}`}</Button>
      </>)}
    </div>
  );
}
