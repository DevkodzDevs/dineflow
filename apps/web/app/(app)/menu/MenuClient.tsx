"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FlaskConical, Trash2, Sparkles, SlidersHorizontal, Camera, Clock, AlertTriangle, Images, ImagePlus, ChevronDown, Wrench, Ban } from "lucide-react";
import { DishPhotoPicker, type DishPhoto } from "@/components/menu/DishPhotoPicker";
import { DishGlyph, glyphFor } from "@/components/menu/DishGlyph";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Field, Sheet, Empty, Switch, cn, useToast } from "@/components/ui";
import { Rail } from "@/components/ui/Rail";
import { Say, CatIcon } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import { catIcon } from "@/lib/say";
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
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(() => items.filter((i) => (cat === "soldout" ? !i.is_available : cat === "all" || i.category_id === cat)), [items, cat]);
  const recipeMap = useMemo(() => { const m: Record<string, Rec[]> = {}; recipes.forEach((r) => (m[r.menu_item_id] ??= []).push(r)); return m; }, [recipes]);
  const soldOut = items.filter((i) => !i.is_available).length;
  const [tools, setTools] = useState(false);
  const toggle = (it: Item, v: boolean) => start(async () => { const r = await toggleAvailable(it.id, v); if ("error" in r) toast(r.error!, "err"); });

  return (
    <div className="space-y-5">
      <SvcHead icon="menu" title="Menu" sub="Switch a dish off when it runs out — waiters see it at once"
        actions={<>
          <button type="button" className="svc-btn quiet sm" onClick={() => setTools((v) => !v)} aria-expanded={tools} data-menu-tools><Wrench size={17} aria-hidden /> More tools<ChevronDown size={16} aria-hidden className={cn("transition-transform", tools && "rotate-180")} /></button>
          <button type="button" className="svc-btn go sm !px-5" onClick={() => openEditor({ is_veg: true, is_available: true, prep_minutes: 15, category_id: cat === "all" || cat === "soldout" ? null : cat })} data-new-dish><Plus size={19} aria-hidden /><Say w="new_dish" /></button>
        </>} />
      {/* the owner's tools, folded: they are used once a week, the switch on each dish every service */}
      {tools && (
        <div className="-mt-2 flex flex-wrap gap-2" data-tools>
          <Button variant="outline" onClick={() => setCatSheet(true)} title="Add, rename or remove categories"><Plus size={16} /> Categories</Button>
          <Button variant="outline" onClick={() => setGroupsSheet(true)}><SlidersHorizontal size={16} /> Add-ons</Button>
          <Button variant="outline" onClick={() => setImporting(true)} title="Photograph a printed menu and add its dishes"><Camera size={16} /> From photo</Button>
          <Button variant="outline" onClick={() => setRecipesOpen(true)} title="Which foods take what from the pantry" data-recipes><FlaskConical size={16} /> Recipes</Button>
          <Button variant="outline" loading={finding} data-find-photos title="Find a photo for every dish that has none" onClick={async () => {
            setFinding(true);
            try { const r = await autoPhotos(); if ("error" in r) toast(r.error!, "err"); else toast(r.found ? `Photos added to ${r.found} dish${r.found === 1 ? "" : "es"}${r.left ? ` · ${r.left} to choose by hand` : ""}` : r.left ? `No sure match for ${r.left} — open a dish to choose` : "Every dish has a photo"); }
            finally { setFinding(false); }
          }}><Images size={16} /> Find photos</Button>
        </div>
      )}
      {/* the categories as chips with their picture and how many dishes; Sold out last, in red */}
      <Rail className="rail-fade flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 [scrollbar-width:none]" arrowClassName="!bottom-1" label="Categories">
        {[{ id: "all", name: "All", icon: "LayoutGrid", n: items.length }, ...categories.map((c) => ({ id: c.id, name: c.name, icon: catIcon(c.name), n: items.filter((i) => i.category_id === c.id).length }))].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className={cn("shrink-0 !min-h-11 rounded-full pl-3.5 pr-2 inline-flex items-center gap-2 text-[14px] font-extrabold transition-colors", cat === c.id ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")} data-cat={c.id}>
            <CatIcon name={c.icon} size={16} />{c.name}<b className={cn("num min-w-6 h-6 px-1.5 rounded-full grid place-items-center text-[12.5px]", cat === c.id ? "bg-[color-mix(in_srgb,var(--color-on-label)_16%,transparent)]" : "bg-[var(--color-fill-2)]")}>{c.n}</b>
          </button>
        ))}
        {soldOut > 0 && <button type="button" onClick={() => setCat("soldout")} aria-pressed={cat === "soldout"} className={cn("svc-chip st-late shrink-0", cat === "soldout" && "ring-2 ring-[var(--color-red)]")} data-cat="soldout"><Ban size={16} aria-hidden /><Say w="sold_out" start /><b className="num">{soldOut}</b></button>}
      </Rail>

      {visible.length === 0 ? (
        cat === "soldout" ? <Empty title="Nothing is sold out" hint="Every dish is on — switch one off from its card when the kitchen runs out." /> :
        <Empty title="No dishes yet" hint="Add your first dish, then map its ingredients so stock drops automatically." action={<Button onClick={() => openEditor({ is_veg: true, is_available: true, prep_minutes: 15 })}>Add a dish</Button>} />
      ) : (<>
        {/* A phone: a list, one row per dish — the photo, the name, the price and its state, and the switch at
            the end of the row. A tap on the name opens the dish (its sizes, add-ons and recipe are in there). */}
        <div className="sm:hidden space-y-2" data-dish-list>
          {visible.map((it) => {
            const vs = variantsOf(it.id); const mapped = recipeMap[it.id]?.length ?? 0;
            const lo = vs.length ? Math.min(...vs.map((v) => Number(v.price))) : Number(it.price);
            return (
              <div key={it.id} data-dish={it.id} data-off={!it.is_available || undefined} className="feather !rounded-[18px] p-2.5 pr-3 flex items-center gap-3 min-w-0">
                <button type="button" onClick={() => setPhotoFor(it)} aria-label={`${it.image_url ? "Change" : "Add"} the photo — ${it.name}`} data-photo
                  className="relative h-16 w-16 shrink-0 !min-h-0 rounded-[14px] overflow-hidden bg-[linear-gradient(160deg,var(--color-bg-3),var(--color-fill))] grid place-items-center">
                  {it.image_url
                    // eslint-disable-next-line @next/next/no-img-element -- a Wikimedia thumbnail or the property's own upload
                    ? <img src={it.image_url} alt="" loading="lazy" className={cn("h-full w-full object-cover", !it.is_available && "grayscale opacity-60")} />
                    : <DishGlyph name={it.name} category={catName(it.category_id)} veg={it.is_veg} size={26} />}
                  <span className="absolute left-1 top-1"><VegBadge veg={it.is_veg} /></span>
                </button>
                <button type="button" onClick={() => openEditor(it)} aria-label={`Edit — ${it.name}`} className="flex-1 min-w-0 text-left !min-h-0 py-0.5">
                  <span className="block font-bold text-[15.5px] leading-snug truncate">{it.name}</span>
                  <span className="mt-0.5 flex items-baseline gap-2 min-w-0">
                    <span className="font-display num text-[20px] leading-none shrink-0">{vs.length > 0 && <span className="font-sans text-[11px] text-steel">from </span>}{formatINR(lo, { whole: true })}</span>
                    <span className={cn("text-[12.5px] font-bold truncate", it.is_available ? "text-[var(--color-green)]" : "text-[var(--color-red)]")}><Say w={it.is_available ? "available" : "sold_out"} start /></span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-steel min-w-0"><Clock size={11} className="shrink-0" />{it.prep_minutes} min<span aria-hidden>·</span>
                    {mapped > 0 ? <span className="text-[var(--color-green)] truncate">{mapped} ingredient{mapped === 1 ? "" : "s"}</span> : <span className="text-[var(--color-orange)] truncate">No recipe</span>}</span>
                </button>
                <Switch on={it.is_available} onChange={(v) => toggle(it, v)} name={`${it.name} available`} />
              </div>
            );
          })}
        </div>

        {/* A tablet and up: one card per dish (2026-10-15, the third pass — the owner marked the last two "not
            looking good"). An inset photo with rounded corners (the card's own 8px padding round it); with no
            photo, a soft neutral plate with the dish's drawing in a glass circle and "Add a photo" — not a block
            of green or red. Under it the name and the price on one line, then "Starters · 15 min" (and, only
            when the dish has none, an amber "No recipe"), then one footer: the Available / Sold out switch as a
            pill, and Edit. Sizes, add-ons and the recipe open from Edit. Sold out darkens the photo under a
            SOLD OUT label and turns the pill red. */}
        <div className="hidden sm:grid gap-4 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]" data-dish-grid>
          <AnimatePresence initial={false}>
            {visible.map((it) => {
              const vs = variantsOf(it.id); const mapped = recipeMap[it.id]?.length ?? 0;
              const lo = vs.length ? Math.min(...vs.map((v) => Number(v.price))) : Number(it.price);
              const Glyph = glyphFor(it.name, catName(it.category_id)); const cat = catName(it.category_id);
              return (
              <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-dish={it.id} data-off={!it.is_available || undefined}
                className="group/dish relative flex flex-col min-w-0 rounded-[26px] p-2 bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]">
                <button type="button" onClick={() => setPhotoFor(it)} aria-label={`${it.image_url ? "Change" : "Add"} the photo — ${it.name}`} title={it.image_url ? (it.image_credit ?? "Change the photo") : "Add a photo"} data-photo
                  className="relative block w-full aspect-[4/3] !min-h-0 rounded-[19px] overflow-hidden isolate">
                  {it.image_url
                    // eslint-disable-next-line @next/next/no-img-element -- a Wikimedia thumbnail or the property's own upload
                    ? <img src={it.image_url} alt={it.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover/dish:scale-[1.04]" />
                    : <span className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[radial-gradient(120%_90%_at_50%_30%,color-mix(in_srgb,var(--color-label)_7%,var(--color-bg-3)),var(--color-bg-3)_70%)]">
                        <span className="h-16 w-16 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--color-label)_7%,transparent)] ring-1 ring-[var(--color-separator)] text-[var(--color-label-2)] transition-transform duration-300 group-hover/dish:scale-105"><Glyph size={30} strokeWidth={1.5} aria-hidden /></span>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-label-3)] group-hover/dish:text-[var(--color-label-2)]"><ImagePlus size={13} aria-hidden /> Add a photo</span>
                      </span>}
                  <span className="absolute left-2.5 top-2.5 z-[1]"><VegBadge veg={it.is_veg} /></span>
                  {it.image_url && <span className="absolute right-2.5 top-2.5 z-[1] h-9 w-9 rounded-full grid place-items-center bg-[rgb(10_10_13/.5)] text-white backdrop-blur-sm opacity-0 group-hover/dish:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity" aria-hidden><Camera size={16} /></span>}
                  {!it.is_available && <span className="absolute inset-0 z-[2] grid place-items-center bg-[rgb(10_10_13/.55)]"><span className="h-9 px-4 rounded-full bg-[var(--color-red)] text-white text-[13px] font-extrabold tracking-[.08em] inline-flex items-center gap-1.5"><Ban size={15} aria-hidden /> SOLD OUT</span></span>}
                </button>
                <div className="px-2 pt-3 flex items-start gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[16.5px] leading-snug truncate" role="heading" aria-level={3} title={it.name}>{it.name}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-steel min-w-0">
                      {cat && <><span className="truncate">{cat}</span><span aria-hidden>·</span></>}
                      <span className="inline-flex items-center gap-1 shrink-0"><Clock size={12} aria-hidden />{it.prep_minutes} min</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right leading-none pt-0.5">
                    {vs.length > 0 && <div className="text-[10.5px] font-semibold text-steel mb-0.5">from</div>}
                    <div className="font-display num text-[24px]">{formatINR(lo, { whole: true })}</div>
                  </div>
                </div>
                {/* the one thing an owner must not miss: a dish that moves no stock */}
                {!mapped && (
                  <button type="button" onClick={() => setRecipeFor(it)} aria-label={`Recipe — ${it.name}`} title={findStandardRecipe(it.name) ? "A standard recipe is ready — tap to add it" : "Map what this dish takes from the pantry"}
                    className="mx-2 mt-2 self-start !min-h-0 h-7 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[12px] font-bold bg-[var(--color-orange-2)] text-[var(--color-orange)] hover:brightness-110">
                    <AlertTriangle size={12} aria-hidden />No recipe{findStandardRecipe(it.name) ? " · add in one tap" : ""}</button>
                )}
                <div className="mt-auto pt-3 flex items-center gap-2">
                  {/* on or off: the whole pill is the switch — a dot, the word, the toggle */}
                  <label className={cn("flex-1 min-w-0 h-12 rounded-[17px] pl-3.5 pr-2 flex items-center gap-2.5 cursor-pointer select-none transition-colors", it.is_available ? "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]" : "bg-[var(--color-red-2)]")} data-available={it.is_available}>
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", it.is_available ? "bg-[var(--color-green)] shadow-[0_0_0_4px_var(--color-green-2)]" : "bg-[var(--color-red)] shadow-[0_0_0_4px_var(--color-red-2)]")} aria-hidden />
                    <span className={cn("flex-1 min-w-0 text-[14px] font-extrabold truncate", it.is_available ? "text-[var(--color-green)]" : "text-[var(--color-red)]")}><Say w={it.is_available ? "available" : "sold_out"} start /></span>
                    <Switch on={it.is_available} onChange={(v) => toggle(it, v)} name={`${it.name} available`} />
                  </label>
                  <button type="button" onClick={() => openEditor(it)} aria-label={`Edit — ${it.name}`} title="Edit — name, price, sizes, add-ons, recipe"
                    className="h-12 w-12 shrink-0 rounded-[17px] grid place-items-center bg-[var(--color-fill)] hover:bg-[var(--color-label)] hover:text-[var(--color-on-label)] transition-colors"><Pencil size={18} /></button>
                </div>
              </motion.div>
            ); })}
          </AnimatePresence>
        </div>
      </>)}

      {/* dish editor */}
      <Sheet open={importing} onClose={() => setImporting(false)} title="Add dishes from a photo" wide>
        {importing && <MenuImport existing={items.map((i) => i.name)} onDone={() => setImporting(false)} />}
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit dish" : "New dish"}>
        <form ref={formRef} className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveMenuItem(fd); if (r && "error" in r) setErr(r.error!); else setEditing(null); })}>
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          {editing?.id && (() => { const it = items.find((x) => x.id === editing.id); return it && (
            <div className="grid grid-cols-2 gap-2" data-dish-more>
              <Button type="button" variant="outline" onClick={() => { setEditing(null); setOptionsFor(it); }}><SlidersHorizontal size={16} /> Sizes &amp; add-ons</Button>
              <Button type="button" variant="outline" onClick={() => { setEditing(null); setRecipeFor(it); }}><FlaskConical size={16} /> Recipe</Button>
            </div>); })()}
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
            {editing?.id && <Button type="button" variant="danger" onClick={() => start(async () => { const r = await deleteMenuItem(editing.id!); if ("error" in r) return void toast(r.error!, "err"); setEditing(null); })}><Trash2 size={16} /></Button>}
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
      <Button className="w-full mt-2" disabled={pending} onClick={() => start(async () => { const r = await saveRecipe(item.id, rows); if ("error" in r) return void toast(r.error!, "err"); onDone(); })}>Save recipe</Button>
    </div>
  );
}

/** The veg mark on a photo's corner: the square every Indian menu prints — a dot for veg, a triangle for
 *  non-veg — on a white chip, so it reads on any picture and in either theme. */
function VegBadge({ veg }: { veg: boolean }) {
  return (
    <span className="h-[22px] w-[22px] rounded-md bg-white grid place-items-center shadow-[0_2px_6px_rgb(0_0_0/.25)]" role="img" aria-label={veg ? "Veg" : "Non-veg"} title={veg ? "Veg" : "Non-veg"}>
      <span className={cn("h-[14px] w-[14px] rounded-[3px] border-2 grid place-items-center", veg ? "border-[var(--color-green)]" : "border-[var(--color-red)]")}>
        {veg ? <span className="h-[6px] w-[6px] rounded-full bg-[var(--color-green)]" /> : <span className="h-0 w-0 border-x-[3.5px] border-x-transparent border-b-[6px] border-b-[var(--color-red)]" />}
      </span>
    </span>
  );
}
