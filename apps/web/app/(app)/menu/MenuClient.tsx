"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, FlaskConical, Trash2, Sparkles, SlidersHorizontal, Camera, Clock, Images, ImagePlus, ChevronDown, Wrench, Ban, Loader2, Globe, GlobeLock, Tag, Check, LayoutGrid, List } from "lucide-react";
import { DishPhotoPicker, type DishPhoto } from "@/components/menu/DishPhotoPicker";
import { DishGlyph, glyphFor } from "@/components/menu/DishGlyph";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Field, Sheet, Empty, Switch, cn, useToast } from "@/components/ui";
import { Rail } from "@/components/ui/Rail";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";
import { Say, CatIcon } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import { catIcon } from "@/lib/say";
import { formatINR } from "@/lib/format";
import { DishImage } from "@/components/menu/DishImage";
import { fmtQty, type StandardRecipe } from "@dineflow/shared";
import { saveCategory, saveMenuItem, toggleAvailable, deleteMenuItem, saveRecipe, deleteCategory, applyStandardRecipe, suggestDish, suggestRecipe, setCategoryStation, setDishPhoto, autoPhotos, autoRecipes } from "./actions";
import { setOnlineAvailable } from "../online-orders/actions";
import { AiButton } from "@/components/ui/AiButton";
import { OptionsEditor, GroupsManager, ComboParts } from "./Options";
import { MenuImport } from "./MenuImport";
import type { VariantRow, GroupRow, LinkRow, ComboRow } from "@/lib/menuOptions";

type Cat = { id: string; name: string; sort_order: number; station?: string | null };
type Item = { id: string; name: string; category_id: string | null; price: number; is_veg: boolean; is_available: boolean; online_available?: boolean; prep_minutes: number; description: string | null; station?: string | null; gst_rate?: number | null; hsn?: string | null; is_combo?: boolean; image_url?: string | null; image_credit?: string | null; image_source?: string | null };
type Ing = { id: string; name: string; unit: string };
type Rec = { menu_item_id: string; ingredient_id: string; qty: number };

export function MenuClient({ categories, items, ingredients, recipes, std = {}, ai = false, stations = [], variants = [], groups = [], links = [], combos = [], canOnline = false, gstRate = 5 }:
  { canOnline?: boolean; categories: Cat[]; items: Item[]; ingredients: Ing[]; recipes: Rec[]; std?: Record<string, StandardRecipe>; ai?: boolean; stations?: string[]; variants?: VariantRow[]; groups?: GroupRow[]; links?: LinkRow[]; combos?: ComboRow[]; gstRate?: number }) {
  const [cat, setCat] = useState<string>("all");
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [recipeFor, setRecipeFor] = useState<Item | null>(null);
  /* The dish form is uncontrolled (defaultValue), which is right for a form a person types into. To
     fill it from the model, the values are written straight onto the inputs — the same thing the
     person would have typed — so nothing about how the form saves changes. */
  const toast = useToast();
  const dishLay = useViewPref("menu", ["list", "cards"] as const, { wideAt: 640 });
  const dishView = dishLay.chosen;
  const dishShown = dishView ?? (dishLay.wide === null ? null : dishLay.wide ? "cards" : "list");
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
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
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
  /* Online (0132): off online, a dish is still sold at the till and the table — only Swiggy, Zomato and the website stop.
     The chef, a manager or an online supervisor (canOnline, lib/online.ts) switches it here or in Online orders. */
  const [onl, setOnl] = useState<Record<string, boolean>>({});
  const isOnline = (it: Item) => onl[it.id] ?? it.online_available !== false;
  const toggleOnline = (it: Item, v: boolean) => { setOnl((m) => ({ ...m, [it.id]: v })); start(async () => { const r = await setOnlineAvailable([it.id], v); if ("error" in r) { setOnl((m) => ({ ...m, [it.id]: !v })); toast(r.error!, "err"); } else toast(v ? `${it.name} is online again` : `${it.name} is off online — still sold in the restaurant`); }); };
  const onlineBtn = (it: Item, size: string) => canOnline && (
    <button type="button" onClick={() => toggleOnline(it, !isOnline(it))} disabled={!it.is_available} aria-pressed={isOnline(it)} data-online-toggle={isOnline(it) ? "on" : "off"}
      aria-label={`${isOnline(it) ? "Take off online" : "Sell online"} — ${it.name}`} title={!it.is_available ? "Sold out everywhere" : isOnline(it) ? "Online — tap to stop selling online" : "Off online — tap to sell online again"}
      className={cn(size, "shrink-0 grid place-items-center transition-colors disabled:opacity-40", isOnline(it) ? "bg-[color-mix(in_srgb,var(--color-green)_14%,transparent)] text-[var(--color-green)]" : "bg-[color-mix(in_srgb,var(--color-orange)_20%,transparent)] text-[var(--color-orange)]")}>
      {isOnline(it) ? <Globe size={18} aria-hidden /> : <GlobeLock size={18} aria-hidden />}
    </button>
  );

  return (
    <div className="space-y-5">
      <SvcHead icon="menu" title="Menu" sub="Switch a dish off when it runs out"
        actions={<>
          <button type="button" className="svc-btn quiet sm" onClick={() => setTools((v) => !v)} aria-expanded={tools} data-menu-tools><Wrench size={17} aria-hidden /> More tools<ChevronDown size={16} aria-hidden className={cn("transition-transform", tools && "rotate-180")} /></button>
          <button type="button" className="svc-btn go sm !px-5" onClick={() => openEditor({ is_veg: true, is_available: true, prep_minutes: 15, category_id: cat === "all" || cat === "soldout" ? null : cat })} data-new-dish><Plus size={19} aria-hidden /><Say w="new_dish" /></button>
        </>} />
      {/* the owner's tools, folded: they are used once a week, the switch on each dish every service */}
      {tools && (
        /* five even tiles in a panel — icon, name, what it is for — two across on a phone, five on a desktop; were
           five outline buttons wrapping in uneven rows (2026-10-21, the owner) */
        <div className="-mt-2 rounded-[22px] p-2 bg-[var(--color-fill)] fill-tiles" data-tools>
          {([
            { k: "cats", Icon: Plus, hue: "--color-tint", label: "Categories", sub: "Add, rename, remove", on: () => setCatSheet(true) },
            { k: "addons", Icon: SlidersHorizontal, hue: "--color-blue", label: "Add-ons", sub: "Extras and choices", on: () => setGroupsSheet(true) },
            { k: "photo", Icon: Camera, hue: "--color-violet", label: "From photo", sub: "Read a printed menu", on: () => setImporting(true) },
            { k: "recipes", Icon: FlaskConical, hue: "--color-orange", label: "Recipes", sub: "What each dish uses", on: () => setRecipesOpen(true) },
            { k: "photos", Icon: Images, hue: "--color-cyan", label: finding ? "Finding…" : "Find photos", sub: "For dishes with none", on: async () => {
              if (finding) return; setFinding(true);
              try { const r = await autoPhotos(); if ("error" in r) toast(r.error!, "err"); else toast(r.found ? `Photos added to ${r.found} dish${r.found === 1 ? "" : "es"}${r.left ? ` · ${r.left} to choose by hand` : ""}` : r.left ? `No sure match for ${r.left} — open a dish to choose` : "Every dish has a photo"); }
              finally { setFinding(false); }
            } },
          ] as const).map(({ k, Icon, hue, label, sub, on }) => (
            <button key={k} type="button" onClick={() => void on()} disabled={k === "photos" && finding} data-tool={k} {...(k === "recipes" ? { "data-recipes": "" } : k === "photos" ? { "data-find-photos": "" } : {})}
              className="min-w-0 !min-h-[4.5rem] rounded-[16px] bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] active:scale-[.98] transition flex items-center gap-3 px-3 py-2.5 text-left shadow-feather disabled:opacity-60">
              <span className="h-10 w-10 shrink-0 rounded-[12px] grid place-items-center" style={{ background: `color-mix(in srgb, var(${hue}) 16%, transparent)`, color: `var(${hue})` }} aria-hidden>{k === "photos" && finding ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}</span>
              <span className="min-w-0 leading-tight"><span className="block text-[14px] font-bold truncate">{label}</span><span className="block text-[11.5px] text-steel leading-snug line-clamp-2 mt-0.5">{sub}</span></span>
            </button>))}
        </div>
      )}
      {/* the categories as chips with their picture and how many dishes; Sold out last, in red */}
      {/* the categories, and beside them how the dishes are shown — the app's one ViewSwitch (2026-10-25, the owner): a list
          (one row a dish, the switch at the end of the row) or cards (the photo first). Nothing chosen: the list on a phone,
          cards from sm, in CSS; a tap is for this visit, the pin keeps it on this device (df-view:menu). */}
      {/* a phone: the chips get the whole row and the switch sits under them at the right (beside them only two chips fit) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0">
      <Rail wrapClassName="min-w-0 flex-1 max-sm:basis-full" className="rail-fade flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]" arrowClassName="!bottom-1" label="Categories">
        {[{ id: "all", name: "All", icon: "LayoutGrid", n: items.length }, ...categories.map((c) => ({ id: c.id, name: c.name, icon: catIcon(c.name), n: items.filter((i) => i.category_id === c.id).length }))].map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)} aria-pressed={cat === c.id} className={cn("shrink-0 !min-h-11 rounded-full pl-3.5 pr-2 inline-flex items-center gap-2 text-[14px] font-extrabold transition-colors", cat === c.id ? "bg-[var(--color-label)] text-[var(--color-on-label)]" : "bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)]")} data-cat={c.id}>
            <CatIcon name={c.icon} size={16} />{c.name}<b className={cn("num min-w-6 h-6 px-1.5 rounded-full grid place-items-center text-[12.5px]", cat === c.id ? "bg-[color-mix(in_srgb,var(--color-on-label)_16%,transparent)]" : "bg-[var(--color-fill-2)]")}>{c.n}</b>
          </button>
        ))}
        {soldOut > 0 && <button type="button" onClick={() => setCat("soldout")} aria-pressed={cat === "soldout"} className={cn("svc-chip st-late shrink-0", cat === "soldout" && "ring-2 ring-[var(--color-red)]")} data-cat="soldout"><Ban size={16} aria-hidden /><Say w="sold_out" start /><b className="num">{soldOut}</b></button>}
      </Rail>
      {items.length > 0 && <div className="max-sm:ml-auto shrink-0"><ViewSwitch label="Show dishes as" data="menu" shown={dishShown} onPick={dishLay.pick} saved={dishLay.saved}
        onKeep={(v) => { dishLay.keep(v); toast(v === "list" ? "The list is your default here" : "Cards are your default here"); }}
        options={[{ v: "list", label: "List", icon: List, word: "List" }, { v: "cards", label: "Cards", icon: LayoutGrid, word: "Cards" }]} /></div>}
      </div>

      {visible.length === 0 ? (
        cat === "soldout" ? <Empty title="Nothing is sold out" hint="All dishes are on." /> :
        <Empty title="No dishes yet" hint="Add a dish, then its recipe." action={<Button onClick={() => openEditor({ is_veg: true, is_available: true, prep_minutes: 15 })}>Add a dish</Button>} />
      ) : (<>
        {/* A phone: a list, one row per dish — the photo, the name, the price and its state, and the switch at
            the end of the row. A tap on the name opens the dish (its sizes, add-ons and recipe are in there). */}
        <div className={dishView === "list" ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4" : cn("space-y-2", dishView === "cards" ? "hidden" : "sm:hidden")} data-dish-list>
          {visible.map((it) => {
            const vs = variantsOf(it.id); const mapped = recipeMap[it.id]?.length ?? 0;
            const lo = vs.length ? Math.min(...vs.map((v) => Number(v.price))) : Number(it.price);
            return (
              <div key={it.id} data-dish={it.id} data-off={!it.is_available || undefined} className="feather !rounded-[18px] p-2.5 pr-3 flex items-center gap-3 min-w-0">
                <button type="button" onClick={() => setPhotoFor(it)} aria-label={`${it.image_url ? "Change" : "Add"} the photo — ${it.name}`} data-photo
                  className="relative h-16 w-16 shrink-0 !min-h-0 rounded-[14px] overflow-hidden bg-[linear-gradient(160deg,var(--color-bg-3),var(--color-fill))] grid place-items-center">
                  {it.image_url
                    ? <DishImage src={it.image_url} w={120} className={cn("h-full w-full object-cover", !it.is_available && "grayscale opacity-60")} />
                    : <DishGlyph name={it.name} category={catName(it.category_id)} veg={it.is_veg} size={26} />}
                  <span className="absolute left-1 top-1"><VegBadge veg={it.is_veg} /></span>
                </button>
                <button type="button" onClick={() => openEditor(it)} aria-label={`Edit — ${it.name}`} className="flex-1 min-w-0 text-left !min-h-0 py-0.5">
                  <span className="block font-bold text-[15.5px] leading-snug truncate">{it.name}</span>
                  <span className="mt-0.5 flex items-baseline gap-2 min-w-0">
                    <span className="font-display num text-[20px] leading-none shrink-0">{vs.length > 0 && <span className="font-sans text-[11px] text-steel">from </span>}{formatINR(lo, { whole: true })}</span>
                    <span className={cn("text-[12.5px] font-bold truncate", it.is_available ? "text-[var(--color-green)]" : "text-[var(--color-red)]")}>{it.is_available && !isOnline(it) ? <span className="text-[var(--color-orange)]" data-not-online>Not online</span> : <Say w={it.is_available ? "available" : "sold_out"} start />}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[12px] text-steel min-w-0"><Clock size={11} className="shrink-0" />{it.prep_minutes} min<span aria-hidden>·</span>
                    {mapped > 0 ? <span className="text-[var(--color-green)] truncate">{mapped} ingredient{mapped === 1 ? "" : "s"}</span>
                      : <span className="inline-flex items-center gap-1.5 min-w-0 font-semibold text-[color-mix(in_srgb,var(--color-orange)_76%,var(--color-label))]" data-no-recipe><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-orange)] shadow-[0_0_0_3px_var(--color-orange-2)]" aria-hidden /><span className="truncate">No recipe</span></span>}</span>
                </button>
                {onlineBtn(it, "h-11 w-11 rounded-[14px]")}
                <Switch on={it.is_available} onChange={(v) => toggle(it, v)} name={`${it.name} available`} />
              </div>
            );
          })}
        </div>

        {/* A tablet and up: one card per dish (2026-10-15, the third pass — the owner marked the last two "not
            looking good"). An inset photo with rounded corners (the card's own 8px padding round it); with no
            photo, a soft neutral plate with the dish's drawing in a glass circle and "Add a photo" — not a block
            of green or red. A dish with no recipe wears a small frosted "No recipe" badge on the photo's bottom-left
            corner. Under the photo the name and the price on one line, then "Starters · 15 min", then one footer: the
            Available / Sold out switch as a pill, and Edit. Sizes, add-ons and the recipe open from Edit. Sold out darkens the photo under a
            SOLD OUT label and turns the pill red. */}
        <div className={cn(dishView === "cards" ? "grid" : dishView === "list" ? "hidden" : "hidden sm:grid", "gap-4 grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]")} data-dish-grid>
          <AnimatePresence initial={false}>
            {visible.map((it) => {
              const vs = variantsOf(it.id); const mapped = recipeMap[it.id]?.length ?? 0;
              const lo = vs.length ? Math.min(...vs.map((v) => Number(v.price))) : Number(it.price);
              const Glyph = glyphFor(it.name, catName(it.category_id)); const cat = catName(it.category_id);
              return (
              <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} data-dish={it.id} data-off={!it.is_available || undefined}
                className="group/dish relative flex flex-col min-w-0 rounded-[26px] p-2 bg-[var(--color-bg-2)] border border-[var(--color-separator)] shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]">
                <div className="relative">
                <button type="button" onClick={() => setPhotoFor(it)} aria-label={`${it.image_url ? "Change" : "Add"} the photo — ${it.name}`} title={it.image_url ? (it.image_credit ?? "Change the photo") : "Add a photo"} data-photo
                  className="relative block w-full aspect-[4/3] !min-h-0 rounded-[19px] overflow-hidden isolate">
                  {it.image_url
                    ? <DishImage src={it.image_url} w={500} alt={it.name} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover/dish:scale-[1.04]" />
                    : <span className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[radial-gradient(120%_90%_at_50%_30%,color-mix(in_srgb,var(--color-label)_7%,var(--color-bg-3)),var(--color-bg-3)_70%)]">
                        <span className="h-16 w-16 rounded-full grid place-items-center bg-[color-mix(in_srgb,var(--color-label)_7%,transparent)] ring-1 ring-[var(--color-separator)] text-[var(--color-label-2)] transition-transform duration-300 group-hover/dish:scale-105"><Glyph size={30} strokeWidth={1.5} aria-hidden /></span>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-label-3)] group-hover/dish:text-[var(--color-label-2)]"><ImagePlus size={13} aria-hidden /> Add a photo</span>
                      </span>}
                  <span className="absolute left-2.5 top-2.5 z-[1]"><VegBadge veg={it.is_veg} /></span>
                  {it.image_url && <span className={cn("absolute top-2.5 z-[1] h-9 w-9 rounded-full grid place-items-center bg-[rgb(10_10_13/.5)] text-white backdrop-blur-sm opacity-0 group-hover/dish:opacity-100 [@media(pointer:coarse)]:opacity-100 transition-opacity", canOnline && it.is_available ? "right-[3.4rem]" : "right-2.5")} aria-hidden><Camera size={16} /></span>}
                  {!it.is_available && <span className="absolute inset-0 z-[2] grid place-items-center bg-[rgb(10_10_13/.55)]"><span className="h-9 px-4 rounded-full bg-[var(--color-red)] text-white text-[13px] font-extrabold tracking-[.08em] inline-flex items-center gap-1.5"><Ban size={15} aria-hidden /> SOLD OUT</span></span>}
                </button>
                {/* online (0132): its own button over the photo's corner — a button cannot sit inside the photo's button */}
                {canOnline && it.is_available && (
                  <button type="button" onClick={() => toggleOnline(it, !isOnline(it))} aria-pressed={isOnline(it)} data-online-toggle={isOnline(it) ? "on" : "off"}
                    aria-label={`${isOnline(it) ? "Take off online" : "Sell online"} — ${it.name}`} title={isOnline(it) ? "Online — tap to stop selling online" : "Off online — tap to sell online again"}
                    className={cn("tap-square absolute right-2.5 top-2.5 z-[3] h-9 rounded-full inline-flex items-center justify-center gap-1.5 backdrop-blur-sm transition-colors", isOnline(it) ? "w-9 bg-[rgb(10_10_13/.5)] text-[var(--color-green)] hover:bg-[rgb(10_10_13/.7)]" : "px-3 bg-[var(--color-orange)] text-white text-[12px] font-extrabold")}>
                    {isOnline(it) ? <Globe size={17} aria-hidden /> : <><GlobeLock size={15} aria-hidden /><span data-not-online>Not online</span></>}
                  </button>
                )}
                {/* No recipe (2026-10-20, the owner's second word on it: "the design and the placing"): a compact frosted
                    badge on the photo's bottom-left corner — the veg mark has the top-left, the camera the top-right — so
                    it takes no row and every card in a row stays the same height. Dark glass with white text reads over
                    any photo and over the no-photo plate, in every theme; an amber dot says what kind of notice it is, and
                    a sparkle when the library already has a standard plate for it. A tap opens the recipe; on touch an
                    invisible ::before makes the target 44px without the badge looking bigger. */}
                {!mapped && (
                  <button type="button" onClick={() => setRecipeFor(it)} aria-label={`Recipe — ${it.name}`} title={std[it.id] ? "Tap to add the ready recipe" : "No recipe — moves no stock"} data-no-recipe
                    className="absolute left-2.5 bottom-2.5 z-[3] !min-h-0 h-[26px] pl-2 pr-2.5 rounded-full inline-flex items-center gap-1.5 text-[11.5px] font-semibold tracking-[.01em] text-white bg-[rgb(10_10_13/.55)] backdrop-blur-md ring-1 ring-white/15 shadow-[0_4px_14px_-6px_rgb(0_0_0/.6)] hover:bg-[rgb(10_10_13/.7)] active:scale-[.96] transition before:absolute before:-inset-[9px] before:content-[''] [@media(pointer:fine)]:before:hidden">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-orange)_72%,white)] shadow-[0_0_0_3px_rgb(255_190_90/.22)]" aria-hidden />
                    No recipe
                    {std[it.id] && <Sparkles size={11} className="shrink-0 opacity-85" aria-hidden />}
                  </button>
                )}
                </div>
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
            <Field label="Kitchen station" hint="Only if made at another station">
              <select name="station" defaultValue={editing?.station ?? ""}><option value="">— same as its category —</option>{stations.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </Field>
          )}
          {/* 0146: the dish's own GST rate (a packaged drink at 18%, say) and its HSN / SAC for the tax invoice; left as they are,
              the property's rate and restaurant service (SAC 996331) */}
          <div className="grid grid-cols-2 gap-3" data-dish-tax>
            <Field label="GST"><select name="gst_rate" defaultValue={editing?.gst_rate == null ? "" : String(Number(editing.gst_rate))}><option value="">As the property ({gstRate}%)</option>{[0, 5, 12, 18, 28, 40].map((r) => <option key={r} value={r}>{r === 0 ? "0% — no GST" : `${r}%`}</option>)}</select></Field>
            <Field label="HSN / SAC" hint="Packaged goods only"><input name="hsn" inputMode="numeric" maxLength={8} pattern="[0-9]{4,8}" className="num" placeholder="996331" defaultValue={editing?.hsn ?? ""} /></Field>
          </div>
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
      <Sheet open={!!photoFor} onClose={() => setPhotoFor(null)} title={`Photo · ${photoFor?.name ?? ""}`} wide>
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
        {recipesOpen && <RecipesOverview items={items} categories={categories} recipeMap={recipeMap} ingredients={ingredients} std={std} onEdit={(it) => { setRecipesOpen(false); setRecipeFor(it); }} />}
      </Sheet>
      <Sheet open={!!recipeFor} onClose={() => setRecipeFor(null)} title={`Recipe · ${recipeFor?.name ?? ""}`}>
        {recipeFor && <RecipeEditor item={recipeFor} ingredients={ingredients} initial={recipeMap[recipeFor.id] ?? []} std={std[recipeFor.id] ?? null} onDone={() => setRecipeFor(null)} ai={ai} />}
      </Sheet>

      {/* categories */}
      <Sheet open={catSheet} onClose={() => setCatSheet(false)} title="Categories">
        {/* iPad and desktop (2026-10-24, the owner: "the categories box doesn't look good"): the icon, the dish count and a
            rename on each row, the add field as one control. The phone keeps the plain rows and form. */}
        {categories.length === 0 && <div className="hidden sm:flex items-center gap-3 rounded-2xl border border-dashed border-[var(--color-separator)] px-4 py-3.5 mb-4 text-[13.5px] text-steel" data-cat-none><Tag size={17} className="shrink-0 text-[var(--color-tint)]" aria-hidden />No categories yet. Add the first one below, or tap a usual one.</div>}
        <ul className="space-y-2 mb-5 sm:space-y-1.5">
          {categories.map((c) => { const n = items.filter((i) => i.category_id === c.id).length; return (
            <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm sm:rounded-2xl sm:px-2.5 sm:py-2 sm:gap-2.5 sm:bg-[var(--color-bg)] sm:min-h-[60px]" data-cat-row={c.id}>
              <span className="hidden sm:grid h-10 w-10 shrink-0 rounded-xl place-items-center bg-[var(--color-green-2)] text-[var(--color-tint)]" aria-hidden><CatIcon name={catIcon(c.name)} size={18} /></span>
              {renaming?.id === c.id
                ? <form className="flex-1 min-w-0 flex items-center gap-1.5" action={() => start(async () => { const fd = new FormData(); fd.set("id", c.id); fd.set("name", renaming.name.trim() || c.name); fd.set("sort_order", String(c.sort_order)); await saveCategory(fd); setRenaming(null); })}>
                    <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: c.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(null); }} className="!h-10 !text-[14.5px] !font-semibold" aria-label={`New name for ${c.name}`} data-cat-rename-input />
                    <button type="submit" className="h-10 w-10 shrink-0 rounded-xl grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)]" aria-label="Save the name"><Check size={17} /></button>
                  </form>
                : <span className="flex-1 min-w-0 truncate sm:flex sm:flex-col sm:leading-tight"><span className="sm:truncate sm:text-[15px] sm:font-bold">{c.name}</span><span className="hidden sm:block text-[12px] text-steel mt-0.5">{n === 1 ? "1 dish" : `${n} dishes`}</span></span>}
              {/* the station this category's dishes print at; "any" keeps them on the expo view only */}
              {stations.length > 0 && <select value={c.station ?? ""} onChange={(e) => start(() => { setCategoryStation(c.id, e.target.value || null); })} className="!w-36 !h-8 !py-0 text-xs" title="Kitchen station"><option value="">any station</option>{stations.map((s) => <option key={s} value={s}>{s}</option>)}</select>}
              {renaming?.id !== c.id && <button type="button" className="hidden sm:grid h-10 w-10 shrink-0 rounded-xl place-items-center text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]" onClick={() => setRenaming({ id: c.id, name: c.name })} aria-label={`Rename ${c.name}`} data-cat-rename><Pencil size={15} /></button>}
              <button className="text-steel hover:text-chili sm:h-10 sm:w-10 sm:shrink-0 sm:rounded-xl sm:grid sm:place-items-center sm:hover:bg-[var(--color-red-2)]" onClick={() => start(() => { deleteCategory(c.id); })} aria-label="Delete"><Trash2 size={15} /></button></li>
          ); })}
        </ul>
        <div className="hidden sm:block text-[11px] font-extrabold uppercase tracking-[.12em] text-steel mb-2">Add a category</div>
        <form className="flex gap-2 sm:gap-1 sm:items-center sm:rounded-2xl sm:border sm:border-[var(--color-separator)] sm:bg-[var(--color-bg)] sm:p-1.5 sm:pl-3.5 sm:transition-colors sm:focus-within:border-[var(--color-tint)] sm:focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-tint)_16%,transparent)]" action={(fd) => start(async () => { await saveCategory(fd); })} data-cat-add>
          <Tag size={18} className="hidden sm:block shrink-0 text-[var(--color-tint)]" aria-hidden />
          <input name="name" placeholder="New category" required className="sm:!border-0 sm:!bg-transparent sm:!shadow-none sm:!h-11 sm:!px-2 sm:!text-[15.5px] sm:!font-semibold" />
          <input type="hidden" name="sort_order" value={categories.length + 1} />
          <Button className="sm:!h-11 sm:!rounded-xl sm:!px-5 sm:shrink-0"><Plus size={17} className="hidden sm:block" aria-hidden />Add</Button>
        </form>
        {(() => { const have = new Set(categories.map((c) => c.name.trim().toLowerCase())); const quick = ["Starters", "Main course", "Breads", "Rice & biryani", "Desserts", "Beverages"].filter((q) => !have.has(q.toLowerCase())); return quick.length > 0 && (
          <div className="hidden sm:flex flex-wrap items-center gap-1.5 mt-3" data-cat-quick>
            <span className="text-[12px] font-semibold text-steel mr-1">Usual ones:</span>
            {quick.map((q, i) => <button key={q} type="button" disabled={pending} onClick={() => start(async () => { const fd = new FormData(); fd.set("name", q); fd.set("sort_order", String(categories.length + 1 + i)); await saveCategory(fd); })}
              className="h-9 px-3 rounded-full text-[13px] font-bold inline-flex items-center gap-1 bg-[var(--color-fill)] hover:bg-[var(--color-fill-2)] disabled:opacity-50"><Plus size={13} aria-hidden />{q}</button>)}
          </div>); })()}
      </Sheet>
    </div>
  );
}

/**
 * Every dish on one screen, with what it takes from the pantry per plate — the owner asked which foods
 * take how much oil and flour, and the answer was spread over 28 recipe sheets. A dish with no recipe
 * that the library knows can be set up here, one or all at once; the rest say "map by hand".
 */
function RecipesOverview({ items, categories, recipeMap, ingredients, std, onEdit }: { items: Item[]; categories: Cat[]; recipeMap: Record<string, Rec[]>; ingredients: Ing[]; std: Record<string, StandardRecipe>; onEdit: (it: Item) => void }) {
  const router = useRouter(); const toast = useToast();
  const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const ingOf = (id: string) => ingredients.find((i) => i.id === id);
  const rows = useMemo(() => items.map((it) => ({ it, lines: recipeMap[it.id] ?? [], std: std[it.id] ?? null })), [items, recipeMap, std]);
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
        <p className="text-xs text-[var(--color-label-2)] mt-1 leading-relaxed">Stock comes off when sent or cooked.{ready > 0 && <> <b>{ready}</b> ready in the library.</>}{byHand > 0 && <> <b>{byHand}</b> to map by hand.</>}</p>
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
                        : <p className="text-[13px] text-[var(--color-label-2)]">Not mapped — moves no stock.</p>}
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

function RecipeEditor({ item, ingredients, initial, std, onDone, ai = false }: { item: Item; ingredients: Ing[]; initial: Rec[]; std: StandardRecipe | null; onDone: () => void; ai?: boolean }) {
  const [rows, setRows] = useState<{ ingredient_id: string; qty: number }[]>(initial.length ? initial.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty) })) : [{ ingredient_id: "", qty: 0 }]);
  const [pending, start] = useTransition();
  const toast = useToast();
  const unit = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? "";
  // the library's plate for this dish, if it knows one — offered before any hand-mapping (found by the server: page.tsx)
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
  if (ingredients.length === 0) return <div className="space-y-3">{standard}<p className="text-sm text-steel">{std ? "Or add" : "Add"} ingredients in Pantry first.</p></div>;
  return (
    <div className="space-y-3">
      {standard}
      <div className="flex items-start gap-3">
        <p className="text-sm text-steel flex-1">Per 1 plate of <b>{item.name}</b>.</p>
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
