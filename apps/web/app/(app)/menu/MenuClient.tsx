"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FlaskConical, Trash2, Sparkles, SlidersHorizontal, Layers, Camera, Clock, AlertTriangle, Images, ImagePlus, ChevronDown } from "lucide-react";
import { DishPhotoPicker, type DishPhoto } from "@/components/menu/DishPhotoPicker";
import { DishGlyph } from "@/components/menu/DishGlyph";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Field, Sheet, Empty, Switch, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { findStandardRecipe, fmtQty } from "@dineflow/shared";
import { saveCategory, saveMenuItem, toggleAvailable, deleteMenuItem, saveRecipe, deleteCategory, applyStandardRecipe, suggestDish, suggestRecipe, setCategoryStation, setDishPhoto, autoPhotos, autoRecipes } from "./actions";
import { AiButton } from "@/components/ui/AiButton";
import { OptionsEditor, GroupsManager, ComboParts } from "./Options";
import { MenuImport } from "./MenuImport";
import type { VariantRow, GroupRow, LinkRow, ComboRow } from "@/lib/menuOptions";

type Cat = { id: string; name: string; sort_order: number; station?: string | null };
type Item = { id: string; name: string; category_id: string | null; price: number; is_veg: boolean; is_available: boolean; prep_minutes: number; description: string | null; station?: string | null; is_combo?: boolean; image_url?: string | null; image_credit?: string | null; image_source?: string | null };
type Ing = { id: string; name: string; unit: string };
type Rec = { menu_item_id: string; ingredient_id: string; qty: number };

export function MenuClient({ categories, items, ingredients, recipes, ai = false, stations = [], variants = [], groups = [], links = [], combos = [] }:
  { categories: Cat[]; items: Item[]; ingredients: Ing[]; recipes: Rec[]; ai?: boolean; stations?: string[]; variants?: VariantRow[]; groups?: GroupRow[]; links?: LinkRow[]; combos?: ComboRow[] }) {
  const [cat, setCat] = useState<string>("all");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [recipeFor, setRecipeFor] = useState<Item | null>(null);
  /* The dish form is uncontrolled (defaultValue), which is right for a form a person types into. To
     fill it from the model, the values are written straight onto the inputs — the same thing the
     person would have typed — so nothing about how the form saves changes. */
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null); const [filling, setFilling] = useState(false);
  const fillDish = async () => {
    const f = formRef.current; if (!f) return;
    const name = (f.elements.namedItem("name") as HTMLInputElement | null)?.value ?? "";
    setFilling(true);
    try {
      const r = await suggestDish(name);
      if ("error" in r) { toast(r.error!, "err"); return; }
      const set = (n: string, v: string) => { const el = f.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement | null; if (el) el.value = v; };
      set("description", r.description); set("price", String(r.price_inr)); set("prep_minutes", String(r.prep_minutes));
      const veg = f.elements.namedItem("is_veg") as HTMLInputElement | null; if (veg) veg.checked = r.is_veg;
      toast("Filled in — check it and save");
    } finally { setFilling(false); }
  };
  const [catSheet, setCatSheet] = useState(false);
  /* Options: the sizes a dish is sold in and the add-on groups it offers; the groups themselves are
     managed in their own sheet. A combo's parts are edited inside the dish form. */
  const [optionsFor, setOptionsFor] = useState<Item | null>(null);
  const [groupsSheet, setGroupsSheet] = useState(false);
  const [combo, setCombo] = useState(false);
  const [parts, setParts] = useState<{ menu_item_id: string; qty: number }[]>([]);
  /* the photo: in the dish form it follows the name as it is typed; from a card it saves at once */
  const [photo, setPhoto] = useState<DishPhoto | null>(null);
  const [dishName, setDishName] = useState(""); const [dishCat, setDishCat] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<Item | null>(null);
  const [finding, setFinding] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  /* Photos find themselves: the first time the menu opens in a session with dishes that have none,
     autoPhotos() runs in the background (the same as pressing Find photos) and the page refreshes
     when it has saved some. Once per session, so a dish nobody could match is not searched on
     every visit — those keep their outline drawing until someone picks or takes a photo. */
  const router = useRouter();
  const missing = items.filter((i) => !i.image_url).length;
  useEffect(() => {
    if (!missing) return;
    const KEY = "dineflow.autoPhotos";
    try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, "1"); } catch { return; }
    let on = true; setFinding(true);
    autoPhotos().then((r) => { if (!on || "error" in r) return; if (r.found) { toast(`Photos added to ${r.found} dish${r.found === 1 ? "" : "es"}`); router.refresh(); } })
      .catch(() => {}).finally(() => { if (on) setFinding(false); });
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first open with dishes missing photos
  }, []);
  const catName = (id: string | null | undefined) => categories.find((c) => c.id === id)?.name ?? null;
  const openEditor = (it: Partial<Item>) => { setPhoto(it.image_url ? { url: it.image_url, credit: it.image_credit, source: it.image_source } : null); setDishName(it.name ?? ""); setDishCat(it.category_id ?? null); setEditing(it); setCombo(!!it.is_combo); setParts(it.id ? combos.filter((c) => c.combo_id === it.id).map((c) => ({ menu_item_id: c.menu_item_id, qty: c.qty })) : []); };
  const variantsOf = (id: string) => variants.filter((v) => v.menu_item_id === id);
  const groupsOf = (id: string) => links.filter((l) => l.menu_item_id === id).map((l) => l.group_id);
  const partsOf = (id: string) => combos.filter((c) => c.combo_id === id);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(() => items.filter((i) => cat === "all" || i.category_id === cat), [items, cat]);
  const recipeMap = useMemo(() => { const m: Record<string, Rec[]> = {}; recipes.forEach((r) => (m[r.menu_item_id] ??= []).push(r)); return m; }, [recipes]);

  return (
    <div className="space-y-5">
      {/* The rail holds filters and nothing else. "Manage categories" used to ride at the end of it,
          which meant the one control that is not a filter was also the first thing to scroll out of
          sight — on a laptop it sat clipped behind the actions, half a dashed circle. It belongs
          with the other things you can do to the menu, where it is always reachable. */}
      <div className="toolbar"><div className="toolbar-group">
        {[{ id: "all", name: "All" }, ...categories].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("chip", cat === c.id && "on")}>{c.name}</button>
        ))}
        </div><div className="toolbar-group toolbar-end">
          <Button variant="outline" onClick={() => setCatSheet(true)} title="Add, rename or remove categories"><Plus size={16} /> Categories</Button>
          <Button variant="outline" onClick={() => setGroupsSheet(true)}><SlidersHorizontal size={16} /> Add-ons</Button>
          <Button variant="outline" onClick={() => setImporting(true)} title="Photograph a printed menu and add its dishes"><Camera size={16} /> From photo</Button>
          <Button variant="outline" onClick={() => setRecipesOpen(true)} title="Which foods take what from the pantry" data-recipes><FlaskConical size={16} /> Recipes</Button>
          <Button variant="outline" loading={finding} data-find-photos title="Find a photo for every dish that has none" onClick={async () => {
            setFinding(true);
            try { const r = await autoPhotos(); if ("error" in r) toast(r.error!, "err"); else toast(r.found ? `Photos added to ${r.found} dish${r.found === 1 ? "" : "es"}${r.left ? ` · ${r.left} to choose by hand` : ""}` : r.left ? `No sure match for ${r.left} — open a dish to choose` : "Every dish has a photo"); }
            finally { setFinding(false); }
          }}><Images size={16} /> Find photos</Button>
          <Button onClick={() => openEditor({ is_veg: true, is_available: true, prep_minutes: 15, category_id: cat === "all" ? null : cat })}><Plus size={16} /> New dish</Button></div>
      </div>

      {visible.length === 0 ? (
        <Empty title="No dishes yet" hint="Add your first dish, then map its ingredients so stock drops automatically." action={<Button onClick={() => openEditor({ is_veg: true, is_available: true, prep_minutes: 15 })}>Add a dish</Button>} />
      ) : (
        /* One card per dish, as many across as fit (about 17rem each): the veg mark, the name and the
           price on top, what it is in a line, what it carries as chips — prep, sizes, add-ons, recipe —
           and a footer strip with the sold-out switch and the three editors as round buttons. */
        <motion.div layout className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
          <AnimatePresence>
            {visible.map((it) => {
              const vs = variantsOf(it.id); const gs = groupsOf(it.id); const mapped = recipeMap[it.id]?.length ?? 0;
              const lo = vs.length ? Math.min(...vs.map((v) => Number(v.price))) : Number(it.price);
              const chip = "inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-semibold";
              return (
              <motion.div key={it.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-dish={it.id}
                className="min-w-0 rounded-[22px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden flex flex-col">
                <div className={cn("p-4 flex-1 flex flex-col gap-3 transition-opacity", !it.is_available && "opacity-55")}>
                  {/* the photo is a small square beside the name — a tap changes it; with none, a dashed square that offers one */}
                  <div className="flex items-start gap-3 min-w-0">
                    <button type="button" onClick={() => setPhotoFor(it)} aria-label={`${it.image_url ? "Change" : "Add"} the photo — ${it.name}`} title={it.image_url ? (it.image_credit ?? "Change the photo") : "Add a photo"} data-photo
                      className={cn("relative shrink-0 h-16 w-16 sm:h-[72px] sm:w-[72px] !min-h-0 rounded-2xl overflow-hidden group", "bg-[var(--color-fill)]")}>
                      {it.image_url
                        // eslint-disable-next-line @next/next/no-img-element -- a Wikimedia thumbnail or the property's own upload
                        ? <><img src={it.image_url} alt={it.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
                            <span className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition"><Pencil size={15} /></span></>
                        /* no photo yet: an outline drawing of the kind of dish, with a small + to add one */
                        : <><DishGlyph name={it.name} category={catName(it.category_id)} veg={it.is_veg} size={28} className="transition duration-300 group-hover:scale-105" />
                            <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full bg-[var(--color-bg-2)] text-[var(--color-label-2)] grid place-items-center shadow-sm group-hover:text-[var(--color-label)]"><ImagePlus size={11} /></span></>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        {/* the mark every Indian menu uses: a square with a dot, green for veg, red for not */}
                        <span title={it.is_veg ? "Veg" : "Non-veg"} aria-label={it.is_veg ? "Veg" : "Non-veg"}
                          className={cn("mt-1 h-[14px] w-[14px] shrink-0 rounded-[3px] border-[1.5px] grid place-items-center", it.is_veg ? "border-[var(--color-green)]" : "border-[var(--color-red)]")}>
                          <span className={cn("h-[6px] w-[6px] rounded-full", it.is_veg ? "bg-[var(--color-green)]" : "bg-[var(--color-red)]")} />
                        </span>
                        <h3 className="flex-1 min-w-0 font-sans font-semibold text-[15.5px] leading-snug line-clamp-2">{it.name}</h3>
                        <div className="shrink-0 text-right leading-none">
                          {vs.length > 0 && <div className="text-[10.5px] text-steel mb-0.5">from</div>}
                          <div className="num font-display text-[19px]">{formatINR(lo, { whole: true })}</div>
                        </div>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-[var(--color-label-2)] line-clamp-2">{it.description || "No description yet"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cn(chip, "bg-[var(--color-fill)] text-[var(--color-label-2)]")}><Clock size={11} />{it.prep_minutes} min</span>
                    {it.is_combo && <span className={cn(chip, "bg-[var(--color-fill)] text-[var(--color-label-2)]")}><Layers size={11} />combo · {partsOf(it.id).length}</span>}
                    {vs.length > 0 && <span className={cn(chip, "bg-[var(--color-fill)] text-[var(--color-label-2)] max-w-full")}><span className="truncate">{vs.map((v) => v.name).join(" / ")}</span></span>}
                    {gs.length > 0 && <span className={cn(chip, "bg-[var(--color-fill)] text-[var(--color-label-2)]")}>{gs.length} add-on{gs.length === 1 ? "" : "s"}</span>}
                    {mapped > 0
                      ? <span className={cn(chip, "bg-[var(--color-green-2)] text-[var(--color-green)]")}><FlaskConical size={11} />{mapped} ingredient{mapped === 1 ? "" : "s"}</span>
                      : <span className={cn(chip, "bg-[var(--color-red-2)] text-[var(--color-red)]")} title={findStandardRecipe(it.name) ? "A standard recipe is available — open Recipe" : undefined}><AlertTriangle size={11} />No recipe{findStandardRecipe(it.name) ? " · standard ready" : ""}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-4 pr-2 py-2 border-t border-[var(--color-separator)] bg-[color-mix(in_srgb,var(--color-fill)_45%,transparent)]">
                  <label className="flex items-center gap-2.5 mr-auto cursor-pointer select-none min-h-11">
                    <Switch on={it.is_available} onChange={(v) => start(() => { toggleAvailable(it.id, v); })} name={`${it.name} available`} />
                    <span className={cn("text-[13px] font-semibold", it.is_available ? "text-[var(--color-green)]" : "text-[var(--color-red)]")}>{it.is_available ? "Available" : "Sold out"}</span>
                  </label>
                  {[
                    { label: "Sizes and add-ons", icon: <SlidersHorizontal size={16} />, on: () => setOptionsFor(it) },
                    { label: "Recipe", icon: <FlaskConical size={16} />, on: () => setRecipeFor(it) },
                    { label: "Edit", icon: <Pencil size={16} />, on: () => openEditor(it) },
                  ].map((b) => (
                    <button key={b.label} type="button" onClick={b.on} aria-label={`${b.label} — ${it.name}`} title={b.label}
                      className="h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 rounded-full grid place-items-center text-[var(--color-label-2)] hover:text-[var(--color-label)] hover:bg-[var(--color-fill-2)] transition-colors">{b.icon}</button>
                  ))}
                </div>
              </motion.div>
            ); })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* dish editor */}
      <Sheet open={importing} onClose={() => setImporting(false)} title="Add dishes from a photo" wide>
        {importing && <MenuImport existing={items.map((i) => i.name)} onDone={() => setImporting(false)} />}
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit dish" : "New dish"}>
        <form ref={formRef} className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveMenuItem(fd); if (r && "error" in r) setErr(r.error!); else setEditing(null); })}>
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Dish name"><div className="flex gap-2 items-center"><input name="name" defaultValue={editing?.name} required autoFocus className="flex-1 min-w-0" onInput={(e) => setDishName((e.target as HTMLInputElement).value)} />
            {ai && <AiButton label="Fill the rest" busy={filling} onClick={() => { void fillDish(); }} />}</div></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)"><input name="price" type="number" step="0.01" min="0" defaultValue={editing?.price} required /></Field>
            <Field label="Prep minutes"><input name="prep_minutes" type="number" min="0" defaultValue={editing?.prep_minutes ?? 15} /></Field>
          </div>
          <Field label="Category">
            <select name="category_id" defaultValue={editing?.category_id ?? ""} onChange={(e) => setDishCat(e.target.value || null)}><option value="">— none —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          {stations.length > 0 && (
            <Field label="Kitchen station" hint="Leave on the category's station unless this dish is made somewhere else">
              <select name="station" defaultValue={editing?.station ?? ""}><option value="">— same as its category —</option>{stations.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </Field>
          )}
          <Field label="Description"><textarea name="description" rows={2} defaultValue={editing?.description ?? ""} /></Field>
          <div className="space-y-1.5"><label>Photo</label>
            {editing && <DishPhotoPicker key={editing.id ?? "new"} name={dishName} category={catName(dishCat)} value={photo} onChange={setPhoto} autoPick={!editing.id || !editing.image_url} />}
          </div>
          <input type="hidden" name="image_url" value={photo?.url ?? ""} /><input type="hidden" name="image_credit" value={photo?.credit ?? ""} /><input type="hidden" name="image_source" value={photo?.source ?? ""} />
          <div className="flex gap-6">
            <label className="flex items-center gap-2 normal-case tracking-normal text-sm"><input type="checkbox" name="is_veg" defaultChecked={editing?.is_veg ?? true} /> Vegetarian</label>
            <label className="flex items-center gap-2 normal-case tracking-normal text-sm"><input type="checkbox" name="is_available" defaultChecked={editing?.is_available ?? true} /> Available now</label>
          </div>
          <label className="flex items-center gap-2 normal-case tracking-normal text-sm"><input type="checkbox" name="is_combo" checked={combo} onChange={(e) => setCombo(e.target.checked)} /> Combo — a meal made of other dishes</label>
          {combo && <ComboParts items={items.filter((m) => m.id !== editing?.id && !m.is_combo)} rows={parts} onChange={setParts} />}
          <input type="hidden" name="parts" value={JSON.stringify(parts)} />
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={pending}>Save dish</Button>
            {editing?.id && <Button type="button" variant="danger" onClick={() => start(async () => { await deleteMenuItem(editing.id!); setEditing(null); })}><Trash2 size={16} /></Button>}
          </div>
        </form>
      </Sheet>

      {/* the photo alone, from a card: saved the moment one is picked */}
      <Sheet open={!!photoFor} onClose={() => setPhotoFor(null)} title={`Photo · ${photoFor?.name ?? ""}`}>
        {photoFor && <DishPhotoPicker key={photoFor.id} name={photoFor.name} category={catName(photoFor.category_id)}
          value={photoFor.image_url ? { url: photoFor.image_url, credit: photoFor.image_credit, source: photoFor.image_source } : null}
          onChange={(p) => start(async () => { const r = await setDishPhoto(photoFor.id, p); if (r && "error" in r) toast(r.error!, "err"); else { setPhotoFor({ ...photoFor, image_url: p?.url ?? null, image_credit: p?.credit ?? null, image_source: p?.source ?? null }); toast(p ? "Photo saved" : "Photo removed"); } })} />}
      </Sheet>

      {/* sizes and add-ons for one dish */}
      <Sheet open={!!optionsFor} onClose={() => setOptionsFor(null)} title={`Options · ${optionsFor?.name ?? ""}`}>
        {optionsFor && <OptionsEditor key={optionsFor.id} itemId={optionsFor.id} itemName={optionsFor.name} variants={variantsOf(optionsFor.id)} groups={groups} linked={groupsOf(optionsFor.id)} onDone={() => setOptionsFor(null)} onManageGroups={() => { setOptionsFor(null); setGroupsSheet(true); }} />}
      </Sheet>

      {/* the property's add-on groups */}
      <Sheet open={groupsSheet} onClose={() => setGroupsSheet(false)} title="Add-on groups" wide>
        <GroupsManager groups={groups} ingredients={ingredients} categories={categories} />
      </Sheet>

      {/* recipe editor */}
      <Sheet open={recipesOpen} onClose={() => setRecipesOpen(false)} title="Recipes · what each dish takes" wide>
        {recipesOpen && <RecipesOverview items={items} categories={categories} recipeMap={recipeMap} ingredients={ingredients} onEdit={(it) => { setRecipesOpen(false); setRecipeFor(it); }} />}
      </Sheet>
      <Sheet open={!!recipeFor} onClose={() => setRecipeFor(null)} title={`Recipe · ${recipeFor?.name ?? ""}`}>
        {recipeFor && <RecipeEditor item={recipeFor} ingredients={ingredients} initial={recipeMap[recipeFor.id] ?? []} onDone={() => setRecipeFor(null)} ai={ai} />}
      </Sheet>

      {/* categories */}
      <Sheet open={catSheet} onClose={() => setCatSheet(false)} title="Categories">
        <ul className="space-y-2 mb-5">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm"><span className="flex-1 min-w-0 truncate">{c.name}</span>
              {/* the station this category's dishes print at; "any" keeps them on the expo view only */}
              {stations.length > 0 && <select value={c.station ?? ""} onChange={(e) => start(() => { setCategoryStation(c.id, e.target.value || null); })} className="!w-36 !h-8 !py-0 text-xs" title="Kitchen station"><option value="">any station</option>{stations.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
              <button className="text-steel hover:text-chili" onClick={() => start(() => { deleteCategory(c.id); })} aria-label="Delete"><Trash2 size={15} /></button></li>
          ))}
        </ul>
        <form className="flex gap-2" action={(fd) => start(async () => { await saveCategory(fd); })}>
          <input name="name" placeholder="New category" required />
          <input type="hidden" name="sort_order" value={categories.length + 1} />
          <Button>Add</Button>
        </form>
      </Sheet>
    </div>
  );
}

/**
 * Every dish on one screen, with what it takes from the pantry per plate — the owner asked which foods
 * take how much oil and flour, and the answer was spread over 28 recipe sheets. A dish with no recipe
 * that the library knows can be set up here, one or all at once; the rest say "map by hand".
 */
function RecipesOverview({ items, categories, recipeMap, ingredients, onEdit }: { items: Item[]; categories: Cat[]; recipeMap: Record<string, Rec[]>; ingredients: Ing[]; onEdit: (it: Item) => void }) {
  const router = useRouter(); const toast = useToast();
  const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const ingOf = (id: string) => ingredients.find((i) => i.id === id);
  const rows = useMemo(() => items.map((it) => ({ it, lines: recipeMap[it.id] ?? [], std: findStandardRecipe(it.name) })), [items, recipeMap]);
  const withRecipe = rows.filter((r) => r.lines.length).length;
  const ready = rows.filter((r) => !r.lines.length && r.std).length;
  const byHand = rows.length - withRecipe - ready;
  const setupAll = async () => {
    setBusy(true);
    try {
      const r = await autoRecipes();
      if ("error" in r) { toast(r.error!, "err"); return; }
      toast(`${r.done} dish${r.done === 1 ? "" : "es"} set up${r.created ? ` · ${r.created} ingredient${r.created === 1 ? "" : "s"} added to the pantry` : ""}${r.unknown.length ? ` · ${r.unknown.length} to map by hand` : ""}`);
      router.refresh();
    } finally { setBusy(false); }
  };
  const applyStd = async (it: Item) => {
    setBusy(true);
    try { const r = await applyStandardRecipe(it.id, it.name); if (!r.ok) toast(r.error ?? "Could not map the recipe", "err"); else { toast(`${r.mapped} ingredients mapped from "${r.dish}"`); router.refresh(); } }
    finally { setBusy(false); }
  };
  const groups = [{ id: null as string | null, name: "Uncategorised" }, ...categories].map((c) => ({ c, rows: rows.filter((r) => (r.it.category_id ?? null) === c.id) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-4" data-recipes-overview>
      <div className="rounded-2xl bg-[var(--color-fill)] p-3.5">
        <div className="text-[15px] font-semibold" data-recipes-summary>{withRecipe} of {rows.length} dishes move the pantry</div>
        <p className="text-xs text-[var(--color-label-2)] mt-1 leading-relaxed">A dish with a recipe takes its ingredients out of stock the moment it is sent to the kitchen (or when cooking starts — Settings → Kitchen).{ready > 0 && <> <b>{ready}</b> can be set up from the library in one press.</>}{byHand > 0 && <> <b>{byHand}</b> need mapping by hand.</>}</p>
        {ready > 0 && <Button className="mt-3 w-full" loading={busy} onClick={() => { void setupAll(); }} data-setup-recipes><Sparkles size={16} /> Set up {ready} dish{ready === 1 ? "" : "es"} from the library</Button>}
      </div>
      {groups.map(({ c, rows: g }) => (
        <section key={c.id ?? "none"}>
          <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--color-label-3)] mb-1.5">{c.name}</div>
          <div className="divide-y divide-[var(--color-separator)] rounded-2xl border border-[var(--color-separator)] bg-[var(--color-bg-2)]">
            {g.map(({ it, lines, std }) => {
              const isOpen = open === it.id;
              const text = lines.length
                ? lines.map((l) => { const ing = ingOf(l.ingredient_id); return ing ? `${fmtQty(Number(l.qty), ing.unit)} ${ing.name}` : null; }).filter(Boolean)
                : std ? std.lines.map((l) => `${fmtQty(l.qty, l.unit)} ${l.name}`) : [];
              return (
                <div key={it.id} data-recipe-row={it.id} data-state={lines.length ? "mapped" : std ? "ready" : "none"}>
                  <button type="button" onClick={() => setOpen(isOpen ? null : it.id)} className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left min-h-12" aria-expanded={isOpen}>
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", lines.length ? "bg-[var(--color-green)]" : std ? "bg-[var(--color-orange)]" : "bg-[var(--color-red)]")} />
                    <span className="flex-1 min-w-0"><span className="block font-semibold text-[14px] truncate">{it.name}</span>
                      <span className="block text-xs text-[var(--color-label-2)] truncate">{lines.length ? `${lines.length} ingredient${lines.length === 1 ? "" : "s"} per plate` : std ? `No recipe · library knows "${std.dish}"` : "No recipe · map by hand"}</span></span>
                    <ChevronDown size={16} className={cn("shrink-0 text-[var(--color-label-3)] transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 -mt-1">
                      {text.length ? <p className={cn("text-[13px] leading-relaxed", lines.length ? "" : "text-[var(--color-label-2)]")} data-recipe-lines>{text.join(" · ")}{!lines.length && <span className="text-xs"> (the library&apos;s plate)</span>}</p>
                        : <p className="text-[13px] text-[var(--color-label-2)]">Nothing mapped yet — this dish does not move stock.</p>}
                      <div className="flex gap-2 mt-2.5">
                        {!lines.length && std && <Button size="sm" disabled={busy} onClick={() => { void applyStd(it); }} data-use-standard><Sparkles size={14} /> Use the library plate</Button>}
                        <Button size="sm" variant="outline" onClick={() => onEdit(it)}><Pencil size={14} /> {lines.length ? "Edit" : "Map by hand"}</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function RecipeEditor({ item, ingredients, initial, onDone, ai = false }: { item: Item; ingredients: Ing[]; initial: Rec[]; onDone: () => void; ai?: boolean }) {
  const [rows, setRows] = useState<{ ingredient_id: string; qty: number }[]>(initial.length ? initial.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty) })) : [{ ingredient_id: "", qty: 0 }]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const unit = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? "";
  // the library's plate for this dish, if it knows one — offered before any hand-mapping
  const std = useMemo(() => findStandardRecipe(item.name), [item.name]);
  const [proposing, setProposing] = useState(false);
  /* The model proposes lines from this property's own pantry; the server has already thrown away any
     id it invented. The person still reads the amounts and presses Save. */
  const propose = async () => {
    setProposing(true);
    try {
      const r = await suggestRecipe(item.name);
      if ("error" in r) { toast(r.error!, "err"); return; }
      setRows(r.rows);
      toast(r.missing.length ? `${r.rows.length} lines proposed · not stocked: ${r.missing.join(", ")}` : `${r.rows.length} lines proposed — check the amounts`);
    } finally { setProposing(false); }
  };
  const useStandard = () => start(async () => {
    const r = await applyStandardRecipe(item.id, item.name);
    if (!r.ok) { toast(r.error ?? "Could not map the recipe", "err"); return; }
    toast(`${r.mapped} ingredients mapped from "${r.dish}"${r.created ? ` · ${r.created} added to the pantry` : ""}${r.skipped.length ? ` · skipped ${r.skipped.join(", ")}: the pantry keeps it in another unit` : ""}`);
    onDone();
  });
  const standard = std && (
    <div className="rounded-xl bg-[var(--color-fill)] p-3 flex items-center gap-3">
      <Sparkles size={16} className="text-saffron shrink-0" />
      <div className="text-sm flex-1 min-w-0">Standard recipe for <b>{std.dish}</b>: {std.lines.length} ingredients for one plate{ingredients.length === 0 ? ", added to the pantry for you" : ""}.</div>
      <Button size="sm" variant="outline" disabled={pending} onClick={useStandard}>Use it</Button>
    </div>
  );
  if (ingredients.length === 0) return <div className="space-y-3">{standard}<p className="text-sm text-steel">{std ? "Or add" : "Add"} ingredients in Pantry first, then map them here.</p></div>;
  return (
    <div className="space-y-3">
      {standard}
      <div className="flex items-start gap-3">
        <p className="text-sm text-steel flex-1">Per 1 plate of <b>{item.name}</b>. Starting a ticket in the kitchen subtracts these amounts from the pantry.</p>
        {ai && <AiButton label="Propose" busy={proposing} onClick={() => { void propose(); }} />}
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_36px] gap-2 items-center">
          <select value={r.ingredient_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, ingredient_id: e.target.value } : x)))}>
            <option value="">Choose ingredient</option>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="relative"><input type="number" step="0.001" min="0" value={r.qty || ""} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} className="num pr-8" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-steel">{unit(r.ingredient_id)}</span></div>
          <button className="text-steel hover:text-chili" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={15} /></button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => setRows([...rows, { ingredient_id: "", qty: 0 }])}><Plus size={14} /> Ingredient</Button>
      <Button className="w-full mt-2" disabled={pending} onClick={() => start(async () => { await saveRecipe(item.id, rows); onDone(); })}>Save recipe</Button>
    </div>
  );
}
