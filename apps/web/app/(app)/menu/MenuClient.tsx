"use client";
import { useMemo, useState, useTransition } from "react";
import { Plus, Leaf, Drumstick, Pencil, FlaskConical, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button, Card, Field, Sheet, Empty, cn } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { saveCategory, saveMenuItem, toggleAvailable, deleteMenuItem, saveRecipe, deleteCategory } from "./actions";

type Cat = { id: string; name: string; sort_order: number };
type Item = { id: string; name: string; category_id: string | null; price: number; is_veg: boolean; is_available: boolean; prep_minutes: number; description: string | null };
type Ing = { id: string; name: string; unit: string };
type Rec = { menu_item_id: string; ingredient_id: string; qty: number };

export function MenuClient({ categories, items, ingredients, recipes }: { categories: Cat[]; items: Item[]; ingredients: Ing[]; recipes: Rec[] }) {
  const [cat, setCat] = useState<string>("all");
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [recipeFor, setRecipeFor] = useState<Item | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const visible = useMemo(() => items.filter((i) => cat === "all" || i.category_id === cat), [items, cat]);
  const recipeMap = useMemo(() => { const m: Record<string, Rec[]> = {}; recipes.forEach((r) => (m[r.menu_item_id] ??= []).push(r)); return m; }, [recipes]);

  return (
    <div className="space-y-5">
      <div className="toolbar"><div className="toolbar-group">
        {[{ id: "all", name: "All" }, ...categories].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-full px-4 h-9 text-sm font-semibold transition", cat === c.id ? "bg-ink text-white" : "bg-card border border-line hover:bg-porcelain")}>{c.name}</button>
        ))}
        <button onClick={() => setCatSheet(true)} className="rounded-full h-9 w-9 grid place-items-center border border-dashed border-steel/50 text-steel hover:text-ink" aria-label="Manage categories"><Plus size={16} /></button>
        </div><div className="toolbar-group toolbar-end"><Button onClick={() => setEditing({ is_veg: true, is_available: true, prep_minutes: 15, category_id: cat === "all" ? null : cat })}><Plus size={16} /> New dish</Button></div>
      </div>

      {visible.length === 0 ? (
        <Empty title="No dishes yet" hint="Add your first dish, then map its ingredients so stock drops automatically." action={<Button onClick={() => setEditing({ is_veg: true, is_available: true, prep_minutes: 15 })}>Add a dish</Button>} />
      ) : (
        <motion.div layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {visible.map((it) => (
              <motion.div key={it.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card lift className={cn("h-full flex flex-col", !it.is_available && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {it.is_veg ? <Leaf size={16} className="text-mint shrink-0" /> : <Drumstick size={16} className="text-chili shrink-0" />}
                      <h3 className="font-sans font-semibold text-base truncate">{it.name}</h3>
                    </div>
                    <div className="num font-semibold">{formatINR(Number(it.price))}</div>
                  </div>
                  <p className="text-xs text-steel mt-1 line-clamp-2 min-h-[2lh]">{it.description || `${it.prep_minutes} min prep`}</p>
                  <div className="mt-3 text-[11px] text-steel">{(recipeMap[it.id]?.length ?? 0)} ingredient{recipeMap[it.id]?.length === 1 ? "" : "s"} mapped</div>
                  <div className="mt-auto pt-4 flex items-center gap-1.5">
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer mr-auto normal-case tracking-normal">
                      <input type="checkbox" className="w-4 h-4 accent-saffron" checked={it.is_available} onChange={(e) => start(() => { toggleAvailable(it.id, e.target.checked); })} />
                      {it.is_available ? "Available" : "Sold out"}
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => setRecipeFor(it)} aria-label="Recipe"><FlaskConical size={15} /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(it)} aria-label="Edit"><Pencil size={15} /></Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* dish editor */}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit dish" : "New dish"}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveMenuItem(fd); if (r && "error" in r) setErr(r.error!); else setEditing(null); })}>
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Dish name"><input name="name" defaultValue={editing?.name} required autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)"><input name="price" type="number" step="0.01" min="0" defaultValue={editing?.price} required /></Field>
            <Field label="Prep minutes"><input name="prep_minutes" type="number" min="0" defaultValue={editing?.prep_minutes ?? 15} /></Field>
          </div>
          <Field label="Category">
            <select name="category_id" defaultValue={editing?.category_id ?? ""}><option value="">— none —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
          <Field label="Description"><textarea name="description" rows={2} defaultValue={editing?.description ?? ""} /></Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 normal-case tracking-normal text-sm"><input type="checkbox" name="is_veg" className="w-4 h-4 accent-saffron" defaultChecked={editing?.is_veg ?? true} /> Vegetarian</label>
            <label className="flex items-center gap-2 normal-case tracking-normal text-sm"><input type="checkbox" name="is_available" className="w-4 h-4 accent-saffron" defaultChecked={editing?.is_available ?? true} /> Available now</label>
          </div>
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={pending}>Save dish</Button>
            {editing?.id && <Button type="button" variant="danger" onClick={() => start(async () => { await deleteMenuItem(editing.id!); setEditing(null); })}><Trash2 size={16} /></Button>}
          </div>
        </form>
      </Sheet>

      {/* recipe editor */}
      <Sheet open={!!recipeFor} onClose={() => setRecipeFor(null)} title={`Recipe · ${recipeFor?.name ?? ""}`}>
        {recipeFor && <RecipeEditor item={recipeFor} ingredients={ingredients} initial={recipeMap[recipeFor.id] ?? []} onDone={() => setRecipeFor(null)} />}
      </Sheet>

      {/* categories */}
      <Sheet open={catSheet} onClose={() => setCatSheet(false)} title="Categories">
        <ul className="space-y-2 mb-5">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"><span>{c.name}</span>
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

function RecipeEditor({ item, ingredients, initial, onDone }: { item: Item; ingredients: Ing[]; initial: Rec[]; onDone: () => void }) {
  const [rows, setRows] = useState<{ ingredient_id: string; qty: number }[]>(initial.length ? initial.map((r) => ({ ingredient_id: r.ingredient_id, qty: Number(r.qty) })) : [{ ingredient_id: "", qty: 0 }]);
  const [pending, start] = useTransition();
  const unit = (id: string) => ingredients.find((i) => i.id === id)?.unit ?? "";
  if (ingredients.length === 0) return <p className="text-sm text-steel">Add ingredients in Pantry first, then map them here.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-steel">Per 1 plate of <b>{item.name}</b>. Every sale subtracts these amounts from the pantry.</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_96px_36px] gap-2 items-center">
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
