"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { Button, Field, cn, useToast } from "@/components/ui";
import { formatINR } from "@/lib/format";
import type { VariantRow, GroupRow } from "@/lib/menuOptions";
import { saveVariants, setItemGroups, saveAddonGroup, deleteAddonGroup, saveAddon, deleteAddon, toggleAddon, addGroupToCategory } from "./actions";

type Ing = { id: string; name: string; unit: string };
const rule = (g: GroupRow) => (g.min_select > 0 ? (g.max_select === 1 ? "pick one" : `pick ${g.min_select}${g.max_select > g.min_select ? `–${g.max_select}` : "+"}`) : g.max_select > 0 ? `up to ${g.max_select}` : "optional");

/** The sizes one dish is sold in, and which add-on groups it offers. */
export function OptionsEditor({ itemId, itemName, variants, groups, linked, onDone, onManageGroups }:
  { itemId: string; itemName: string; variants: VariantRow[]; groups: GroupRow[]; linked: string[]; onDone: () => void; onManageGroups: () => void }) {
  const [rows, setRows] = useState<{ id?: string; name: string; price: number; is_default: boolean }[]>(variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price), is_default: v.is_default })));
  const [picked, setPicked] = useState<string[]>(linked);
  const [pending, start] = useTransition(); const toast = useToast();
  const set = (i: number, patch: Partial<{ name: string; price: number }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-2"><div className="text-xs font-semibold uppercase tracking-wide text-steel">Sizes</div><span className="text-[11px] text-steel">Half / Full, Small / Large — each at its own price</span></div>
        {rows.length === 0 && <p className="text-sm text-steel mb-2">Sold in one size, at the dish&apos;s price.</p>}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_36px_36px] gap-2 items-center">
              <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Half" />
              <input type="number" min={0} step="0.01" className="num" value={r.price || ""} onChange={(e) => set(i, { price: Number(e.target.value) })} placeholder="₹" />
              <button type="button" title="The size taken when nobody chooses" aria-pressed={r.is_default} onClick={() => setRows(rows.map((x, j) => ({ ...x, is_default: j === i })))}
                className={cn("h-9 w-9 rounded-lg border grid place-items-center", r.is_default ? "bg-ink text-on-label border-ink" : "border-line text-steel")}><Check size={14} /></button>
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-steel hover:text-chili" aria-label="Remove"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { name: "", price: 0, is_default: rows.length === 0 }])}><Plus size={14} /> Size</Button>
          {rows.length === 0 && <Button variant="outline" size="sm" onClick={() => setRows([{ name: "Half", price: 0, is_default: false }, { name: "Full", price: 0, is_default: true }])}>Half / Full</Button>}
        </div>
        {rows.length > 0 && <p className="text-[11px] text-steel mt-2">The tick marks the size rung up when nobody says which. The dish&apos;s own price is not used while it has sizes.</p>}
      </section>
      <section>
        <div className="flex items-baseline justify-between mb-2"><div className="text-xs font-semibold uppercase tracking-wide text-steel">Add-on groups</div><button type="button" onClick={onManageGroups} className="text-[11px] font-semibold underline text-steel">Manage groups</button></div>
        {groups.length === 0 ? <p className="text-sm text-steel">No add-on groups yet. Create one — &ldquo;Extras&rdquo;, &ldquo;Choose your bread&rdquo; — then tick it here.</p> : (
          <div className="space-y-1.5">{groups.map((g) => { const on = picked.includes(g.id); return (
            <button key={g.id} type="button" aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== g.id) : [...picked, g.id])}
              className={cn("w-full rounded-xl border px-3 py-2 flex items-center gap-2.5 text-left text-sm", on ? "border-saffron bg-saffron/10" : "border-line")}>
              <span className={cn("h-5 w-5 rounded-md border grid place-items-center shrink-0", on ? "bg-saffron border-saffron text-on-tint" : "border-line")}>{on && <Check size={13} />}</span>
              <span className="flex-1 min-w-0"><span className="font-medium">{g.name}</span><span className="block text-[11px] text-steel truncate">{g.addons.map((a) => a.name).join(", ") || "no add-ons yet"} · {rule(g)}</span></span>
            </button>); })}</div>
        )}
      </section>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const r1 = await saveVariants(itemId, rows); if ("error" in r1) { toast(r1.error!, "err"); return; }
        const r2 = await setItemGroups(itemId, picked); if ("error" in r2) { toast(r2.error!, "err"); return; }
        toast(`${itemName} saved`); onDone();
      })}>Save options</Button>
    </div>
  );
}

/** Every add-on group of the property, with its add-ons, and the form for a new one. */
export function GroupsManager({ groups, ingredients, categories }: { groups: GroupRow[]; ingredients: Ing[]; categories: { id: string; name: string }[] }) {
  const [pending, start] = useTransition(); const toast = useToast();
  const [open, setOpen] = useState<string | null>(groups[0]?.id ?? null);
  const ingOf = (id: string | null | undefined) => ingredients.find((i) => i.id === id);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className="rounded-2xl border border-line">
          <button type="button" className="w-full flex items-center gap-2 px-4 py-3 text-left" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}>
            <span className="font-semibold flex-1 min-w-0 truncate">{g.name}</span>
            <span className="text-[11px] text-steel shrink-0">{g.addons.length} add-on{g.addons.length === 1 ? "" : "s"} · {rule(g)}</span>
          </button>
          {open === g.id && (
            <div className="px-4 pb-4 space-y-3">
              <form className="grid grid-cols-[1fr_72px_72px_auto_auto] gap-2 items-end" action={(fd) => start(async () => { const r = await saveAddonGroup(fd); if (r && "error" in r) toast(r.error!, "err"); })}>
                <input type="hidden" name="id" value={g.id} />
                <Field label="Name"><input name="name" defaultValue={g.name} /></Field>
                <Field label="Min"><input name="min_select" type="number" min={0} className="num" defaultValue={g.min_select} /></Field>
                <Field label="Max" hint="0 = any"><input name="max_select" type="number" min={0} className="num" defaultValue={g.max_select} /></Field>
                <Button size="sm" disabled={pending}>Save</Button>
                <Button type="button" size="sm" variant="danger" disabled={pending} aria-label="Delete group" onClick={() => { if (confirm(`Delete "${g.name}" and its add-ons?`)) start(async () => { await deleteAddonGroup(g.id); }); }}><Trash2 size={14} /></Button>
              </form>
              <div className="divide-y divide-line rounded-xl border border-line">
                {g.addons.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={cn("flex-1 min-w-0 truncate", !a.is_available && "line-through text-steel")}>{a.name}{a.ingredient_id && ingOf(a.ingredient_id) && <span className="text-[11px] text-steel"> · draws {a.ingredient_qty} {ingOf(a.ingredient_id)!.unit} {ingOf(a.ingredient_id)!.name}</span>}</span>
                    <span className="num text-steel shrink-0">{Number(a.price) > 0 ? `+${formatINR(Number(a.price))}` : "free"}</span>
                    <label className="flex items-center gap-1 text-[11px] text-steel shrink-0" title="Untick when it has run out for the day"><input type="checkbox" className="accent-saffron" checked={a.is_available} onChange={(e) => start(() => { toggleAddon(a.id, e.target.checked); })} /> today</label>
                    <button type="button" className="text-steel hover:text-chili shrink-0" onClick={() => start(async () => { await deleteAddon(a.id); })} aria-label="Remove"><Trash2 size={14} /></button>
                  </div>
                ))}
                {g.addons.length === 0 && <p className="px-3 py-2 text-xs text-steel">No add-ons in this group yet.</p>}
              </div>
              <form className="rounded-xl bg-[var(--color-fill)] p-3 space-y-2" action={(fd) => start(async () => { const r = await saveAddon(fd); if (r && "error" in r) toast(r.error!, "err"); })}>
                <input type="hidden" name="group_id" value={g.id} />
                <div className="grid grid-cols-[1fr_90px_auto] gap-2 items-end">
                  <Field label="New add-on"><input name="name" placeholder="Extra cheese" required /></Field>
                  <Field label="Price"><input name="price" type="number" min={0} step="0.01" className="num" placeholder="0" /></Field>
                  <label className="flex items-center gap-1.5 h-10 text-xs normal-case tracking-normal"><input type="checkbox" name="is_veg" defaultChecked className="accent-saffron" /> veg</label>
                </div>
                <div className="grid grid-cols-[1fr_90px_auto] gap-2 items-end">
                  <Field label="Draws from the pantry" hint="optional"><select name="ingredient_id" defaultValue=""><option value="">— nothing —</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></Field>
                  <Field label="Qty"><input name="ingredient_qty" type="number" min={0} step="0.001" className="num" placeholder="0.03" /></Field>
                  <Button size="sm" disabled={pending}><Plus size={14} /> Add</Button>
                </div>
              </form>
              {categories.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-steel">
                  <span>Offer this on every dish in</span>
                  <select className="!h-8 !py-0 !w-44 text-xs" defaultValue="" onChange={(e) => { const cid = e.target.value; if (!cid) return; e.target.value = ""; start(async () => { const r = await addGroupToCategory(cid, g.id); if ("error" in r) toast(r.error!, "err"); else toast(`Added to ${r.dishes} dish${r.dishes === 1 ? "" : "es"}`); }); }}>
                    <option value="">choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <form className="rounded-xl bg-[var(--color-fill)] p-4" action={(fd) => start(async () => { const r = await saveAddonGroup(fd); if (r && "error" in r) toast(r.error!, "err"); })}>
        <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-2">New group</div>
        <input type="hidden" name="sort_order" value={groups.length + 1} />
        <div className="grid grid-cols-[1fr_72px_72px_auto] gap-2 items-end">
          <Field label="Name"><input name="name" placeholder="Choose your bread" required /></Field>
          <Field label="Min"><input name="min_select" type="number" min={0} className="num" defaultValue={0} /></Field>
          <Field label="Max" hint="1 = pick one"><input name="max_select" type="number" min={0} className="num" defaultValue={0} /></Field>
          <Button disabled={pending} aria-label="Add group"><Plus size={16} /></Button>
        </div>
        <p className="text-[11px] text-steel mt-2">Min 1 · Max 1 is a required pick-one (&ldquo;Choose your bread&rdquo;). Min 0 · Max 0 is any number of optional extras.</p>
      </form>
    </div>
  );
}

/** What a combo is made of: other dishes, each with a quantity. Lives inside the dish form. */
export function ComboParts({ items, rows, onChange }: { items: { id: string; name: string }[]; rows: { menu_item_id: string; qty: number }[]; onChange: (rows: { menu_item_id: string; qty: number }[]) => void }) {
  return (
    <div className="rounded-xl bg-[var(--color-fill)] p-3 space-y-2">
      <div className="text-[11px] text-steel">The kitchen ticket lists these, and the pantry draws each part&apos;s recipe. The combo is sold at the price above.</div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_72px_32px] gap-2 items-center">
          <select value={r.menu_item_id} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, menu_item_id: e.target.value } : x)))}><option value="">Choose a dish</option>{items.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <input type="number" min={1} className="num" value={r.qty || ""} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} />
          <button type="button" className="text-steel hover:text-chili" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { menu_item_id: "", qty: 1 }])}><Plus size={14} /> Part</Button>
    </div>
  );
}
