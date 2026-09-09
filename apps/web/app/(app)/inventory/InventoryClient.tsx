"use client";
import { useMemo, useState, useTransition } from "react";
import { Plus, ArrowDownToLine, Trash2, Pencil, PackagePlus, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { Button, Card, Field, Sheet, Empty, Pill, StatTile, cn } from "@/components/ui";
import { formatINR, fmtTime, fmtDate } from "@/lib/format";
import { UNITS, INGREDIENT_CATEGORIES } from "@dineflow/shared";
import { saveIngredient, archiveIngredient, moveStock, recordPurchase } from "./actions";

type Ing = { id: string; name: string; unit: string; current_stock: number; reorder_level: number; cost_per_unit: number; barcode?: string | null; category?: string | null; brand?: string | null; pack_qty?: number | null };
type Led = { id: string; ingredient_id: string; qty: number; reason: string; note: string | null; created_at: string };
type Pur = { id: string; supplier: string | null; invoice_no: string | null; total: number; purchased_at: string };

export function InventoryClient({ ingredients, ledger, purchases }: { ingredients: Ing[]; ledger: Led[]; purchases: Pur[] }) {
  const [tab, setTab] = useState<"stock" | "purchases" | "ledger">("stock");
  const [editing, setEditing] = useState<Partial<Ing> | null>(null);
  const [move, setMove] = useState<Ing | null>(null);
  const [purchase, setPurchase] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const low = ingredients.filter((i) => Number(i.current_stock) <= Number(i.reorder_level));
  const value = ingredients.reduce((t, i) => t + Number(i.current_stock) * Number(i.cost_per_unit), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Items tracked" value={String(ingredients.length)} />
        <StatTile label="Below reorder level" value={String(low.length)} tone={low.length ? "alert" : "good"} sub={low.length ? "Order soon" : "All stocked"} delay={0.05} />
        <StatTile label="Stock value" value={formatINR(value)} sub="at last purchase cost" delay={0.1} />
        <StatTile label="Movements today" value={String(ledger.filter((l) => l.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length)} delay={0.15} />
      </div>

      <div className="toolbar"><div className="toolbar-group">
        {(["stock", "purchases", "ledger"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-full px-4 h-9 text-sm font-semibold capitalize transition", tab === t ? "bg-ink text-white" : "bg-card border border-line hover:bg-porcelain")}>{t}</button>
        ))}
        </div><div className="toolbar-group toolbar-end">
          <Button variant="outline" onClick={() => setPurchase(true)}><PackagePlus size={16} /> Record purchase</Button>
          <Button onClick={() => setEditing({ unit: "kg", reorder_level: 0, cost_per_unit: 0 })}><Plus size={16} /> Ingredient</Button>
        </div>
      </div>

      {tab === "stock" && (ingredients.length === 0 ? (
        <Empty title="Pantry is empty" hint="Add ingredients like rice, oil, chicken, paneer. Then record a purchase or an opening balance." />
      ) : (
        <div className="feather overflow-x-auto table-wrap">
          <table className="w-full text-sm">
            <thead className="bg-porcelain text-xs uppercase tracking-wide text-steel"><tr><th className="text-left px-4 py-3">Ingredient</th><th className="text-right px-4 py-3">In stock</th><th className="text-right px-4 py-3 hidden sm:table-cell">Reorder at</th><th className="text-right px-4 py-3 hidden md:table-cell">Cost/unit</th><th className="px-4 py-3"></th></tr></thead>
            <tbody>
              {ingredients.map((i, idx) => {
                const isLow = Number(i.current_stock) <= Number(i.reorder_level);
                const pct = Math.min(100, Number(i.reorder_level) > 0 ? (Number(i.current_stock) / (Number(i.reorder_level) * 3)) * 100 : 100);
                return (
                  <motion.tr key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }} className="border-t border-line">
                    <td className="px-4 py-3">
                      <div className="font-semibold flex items-center gap-2">{i.name}{i.category && <span className="text-[10px] text-steel font-normal">{i.category}</span>}{i.barcode && <span className="text-[10px] num text-steel">▮▯▮ {i.barcode.slice(-4)}</span>}{isLow && <Pill tone="alert"><AlertTriangle size={11} /> low</Pill>}</div>
                      <div className="mt-1.5 h-1.5 w-32 rounded-full bg-line overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, delay: 0.1 + idx * 0.02 }} className={cn("h-full rounded-full", isLow ? "bg-chili" : "bg-mint")} /></div>
                    </td>
                    <td className="px-4 py-3 text-right num font-semibold">{Number(i.current_stock).toFixed(i.unit === "pcs" ? 0 : 2)} <span className="text-xs text-steel">{i.unit}</span></td>
                    <td className="px-4 py-3 text-right num text-steel hidden sm:table-cell">{Number(i.reorder_level)} {i.unit}</td>
                    <td className="px-4 py-3 text-right num text-steel hidden md:table-cell">{formatINR(Number(i.cost_per_unit))}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setMove(i)} aria-label="Adjust stock"><ArrowDownToLine size={15} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label="Edit"><Pencil size={15} /></Button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === "purchases" && (purchases.length === 0 ? <Empty title="No purchases recorded" hint="Record a supplier bill and the stock lands in the pantry instantly." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {purchases.map((p) => (
            <Card key={p.id}><div className="flex justify-between"><div><div className="font-semibold">{p.supplier || "Supplier"}</div><div className="text-xs text-steel">{p.invoice_no ? `Inv ${p.invoice_no} · ` : ""}{fmtDate(p.purchased_at)}</div></div><div className="num font-semibold">{formatINR(Number(p.total))}</div></div></Card>
          ))}
        </div>
      ))}

      {tab === "ledger" && (
        <div className="feather divide-y divide-line">
          {ledger.length === 0 && <p className="p-6 text-sm text-steel">Every stock change shows here — sales, purchases, wastage, adjustments.</p>}
          {ledger.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={cn("num font-semibold w-24 text-right", Number(l.qty) < 0 ? "text-chili" : "text-ink")}>{Number(l.qty) > 0 ? "+" : ""}{Number(l.qty).toFixed(3)} {byId[l.ingredient_id]?.unit}</span>
              <span className="font-medium flex-1 truncate">{byId[l.ingredient_id]?.name ?? "—"}</span>
              <Pill tone={l.reason === "wastage" ? "alert" : l.reason === "sale" ? "served" : "ready"}>{l.reason}</Pill>
              <span className="text-xs text-steel num hidden sm:block">{fmtDate(l.created_at)} {fmtTime(l.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit ingredient" : "New ingredient"}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await saveIngredient(fd); if (r && "error" in r) setErr(r.error!); else setEditing(null); })}>
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Name"><input name="name" defaultValue={editing?.name} required autoFocus placeholder="Basmati rice" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Unit"><select name="unit" defaultValue={editing?.unit ?? "kg"}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Reorder at"><input name="reorder_level" type="number" step="0.001" min="0" defaultValue={editing?.reorder_level ?? 0} /></Field>
            <Field label="Cost / unit"><input name="cost_per_unit" type="number" step="0.01" min="0" defaultValue={editing?.cost_per_unit ?? 0} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Category"><select name="category" defaultValue={editing?.category ?? "grocery"}>{INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Brand"><input name="brand" defaultValue={editing?.brand ?? ""} /></Field>
            <Field label="Pack qty" hint="what one scan adds"><input name="pack_qty" type="number" step="0.001" className="num" defaultValue={editing?.pack_qty ?? ""} /></Field>
          </div>
          <Field label="Barcode" hint="Scan the pack on the Scan page to fill this"><input name="barcode" className="num" defaultValue={editing?.barcode ?? ""} /></Field>
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>
            {editing?.id && <Button type="button" variant="danger" onClick={() => start(async () => { await archiveIngredient(editing.id!); setEditing(null); })}><Trash2 size={16} /></Button>}</div>
        </form>
      </Sheet>

      <Sheet open={!!move} onClose={() => setMove(null)} title={`Adjust · ${move?.name ?? ""}`}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await moveStock(fd); if (r && "error" in r) setErr(r.error!); else setMove(null); })}>
          <input type="hidden" name="ingredient_id" value={move?.id} />
          <p className="text-sm text-steel">Currently <b className="num">{Number(move?.current_stock).toFixed(2)} {move?.unit}</b></p>
          <Field label="Reason"><select name="reason" defaultValue="adjustment"><option value="opening">Opening balance</option><option value="adjustment">Adjustment (count correction)</option><option value="wastage">Wastage / spoilage</option></select></Field>
          <Field label="Direction (for adjustment)"><select name="direction" defaultValue="in"><option value="in">Add to stock</option><option value="out">Remove from stock</option></select></Field>
          <Field label={`Quantity (${move?.unit})`}><input name="qty" type="number" step="0.001" min="0" required className="num" /></Field>
          <Field label="Note"><input name="note" placeholder="Spilled during prep" /></Field>
          {err && <p className="text-sm text-chili">{err}</p>}
          <Button className="w-full" disabled={pending}>Apply</Button>
        </form>
      </Sheet>

      <Sheet open={purchase} onClose={() => setPurchase(false)} title="Record purchase" wide>
        <PurchaseForm ingredients={ingredients} onDone={() => setPurchase(false)} />
      </Sheet>
    </div>
  );
}

function PurchaseForm({ ingredients, onDone }: { ingredients: Ing[]; onDone: () => void }) {
  const [supplier, setSupplier] = useState(""); const [inv, setInv] = useState("");
  const [lines, setLines] = useState([{ ingredient_id: "", qty: 0, unit_cost: 0 }]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = lines.reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const set = (i: number, k: string, v: string) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: k === "ingredient_id" ? v : Number(v) } : l)));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3"><Field label="Supplier"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Murugan Traders" /></Field><Field label="Invoice no."><input value={inv} onChange={(e) => setInv(e.target.value)} /></Field></div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_80px_90px_28px] gap-2 text-[11px] uppercase text-steel font-semibold"><span>Ingredient</span><span>Qty</span><span>Cost/unit</span><span /></div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_90px_28px] gap-2 items-center">
            <select value={l.ingredient_id} onChange={(e) => set(i, "ingredient_id", e.target.value)}><option value="">Choose</option>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select>
            <input type="number" step="0.001" min="0" className="num" value={l.qty || ""} onChange={(e) => set(i, "qty", e.target.value)} />
            <input type="number" step="0.01" min="0" className="num" value={l.unit_cost || ""} onChange={(e) => set(i, "unit_cost", e.target.value)} />
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-steel hover:text-chili" aria-label="Remove"><Trash2 size={15} /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ingredient_id: "", qty: 0, unit_cost: 0 }])}><Plus size={14} /> Line</Button>
      </div>
      <div className="flex justify-between items-center border-t border-line pt-3"><span className="text-sm text-steel">Total</span><span className="num text-xl font-semibold">{formatINR(total)}</span></div>
      {err && <p className="text-sm text-chili">{err}</p>}
      <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await recordPurchase(supplier, inv, lines); if ("error" in r) setErr(r.error!); else onDone(); })}>Add to pantry</Button>
    </div>
  );
}
