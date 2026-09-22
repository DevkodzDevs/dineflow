"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, ArrowDownToLine, Trash2, Pencil, PackagePlus, AlertTriangle, History } from "lucide-react";
import { motion } from "framer-motion";
import { Button, Card, Field, Sheet, Empty, Pill, StatTile, cn } from "@/components/ui";
import { formatINR, fmtTime, fmtDate } from "@/lib/format";
import { UNITS, INGREDIENT_CATEGORIES, WASTE_REASONS } from "@dineflow/shared";
import { saveIngredient, archiveIngredient, moveStock, recordPurchase, ingredientPrices, type PriceHistory } from "./actions";
import { PurchaseOrders, Suppliers, WastageView, type Ing, type Supplier, type Po, type Wastage } from "./Purchasing";

type Led = { id: string; ingredient_id: string; qty: number; reason: string; sub_reason?: string | null; note: string | null; created_at: string };
type Pur = { id: string; supplier: string | null; invoice_no: string | null; total: number; purchased_at: string; po_id?: string | null };
type IngRow = Ing & { barcode?: string | null; category?: string | null; brand?: string | null };
type Tab = "stock" | "purchases" | "orders" | "suppliers" | "wastage" | "ledger";

export function InventoryClient({ ingredients, ledger, purchases, suppliers = [], orders = [], wastage = null, restaurant = "" }: { ingredients: IngRow[]; ledger: Led[]; purchases: Pur[]; suppliers?: Supplier[]; orders?: Po[]; wastage?: Wastage; restaurant?: string }) {
  const [tab, setTab] = useState<Tab>("stock");
  const [editing, setEditing] = useState<Partial<IngRow> | null>(null);
  const [move, setMove] = useState<IngRow | null>(null);
  const [reason, setReason] = useState("adjustment");
  const [purchase, setPurchase] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const low = ingredients.filter((i) => Number(i.current_stock) <= Number(i.reorder_level));
  const value = ingredients.reduce((t, i) => t + Number(i.current_stock) * Number(i.cost_per_unit), 0);
  const onOrder = orders.filter((o) => o.status === "draft" || o.status === "sent").length;
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "stock", label: "Stock" }, { key: "purchases", label: "Purchases" }, { key: "orders", label: "Orders", badge: onOrder || undefined },
    { key: "suppliers", label: "Suppliers" }, { key: "wastage", label: "Wastage" }, { key: "ledger", label: "Ledger" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Items tracked" value={String(ingredients.length)} />
        <StatTile label="Below reorder level" value={String(low.length)} tone={low.length ? "alert" : "good"} sub={low.length ? (onOrder ? `${onOrder} order${onOrder === 1 ? "" : "s"} on the way` : "Order soon") : "All stocked"} delay={0.05} />
        <StatTile label="Stock value" value={formatINR(value)} sub="at last purchase cost" delay={0.1} />
        <StatTile label="Movements today" value={String(ledger.filter((l) => l.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length)} delay={0.15} />
      </div>

      <div className="toolbar"><div className="toolbar-group">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn("rounded-full px-4 h-9 text-sm font-semibold transition flex items-center gap-1.5", tab === t.key ? "bg-ink text-on-label" : "bg-card border border-line hover:bg-porcelain")}>{t.label}{t.badge ? <span className={cn("num text-[11px] rounded-full px-1.5", tab === t.key ? "bg-white/20" : "bg-saffron/20 text-saffron")}>{t.badge}</span> : null}</button>
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
                      <Button size="sm" variant="ghost" onClick={() => { setReason("adjustment"); setMove(i); }} aria-label="Adjust stock"><ArrowDownToLine size={15} /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(i)} aria-label="Edit"><Pencil size={15} /></Button>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {tab === "purchases" && (purchases.length === 0 ? <Empty title="No purchases recorded" hint="Record a supplier bill and the stock lands in the pantry instantly — or draft an order under Orders and receive it when the van comes." /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {purchases.map((p) => (
            <Card key={p.id}><div className="flex justify-between"><div><div className="font-semibold">{p.supplier || "Supplier"}</div><div className="text-xs text-steel">{p.invoice_no ? `Inv ${p.invoice_no} · ` : ""}{fmtDate(p.purchased_at)}{p.po_id ? " · against an order" : ""}</div></div><div className="num font-semibold">{formatINR(Number(p.total))}</div></div></Card>
          ))}
        </div>
      ))}

      {tab === "orders" && <PurchaseOrders orders={orders} suppliers={suppliers} ingredients={ingredients} restaurant={restaurant} />}
      {tab === "suppliers" && <Suppliers suppliers={suppliers} />}
      {tab === "wastage" && <WastageView w={wastage} />}

      {tab === "ledger" && (
        <div className="feather divide-y divide-line">
          {ledger.length === 0 && <p className="p-6 text-sm text-steel">Every stock change shows here — sales, purchases, wastage, adjustments.</p>}
          {ledger.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className={cn("num font-semibold w-24 text-right", Number(l.qty) < 0 ? "text-chili" : "text-ink")}>{Number(l.qty) > 0 ? "+" : ""}{Number(l.qty).toFixed(3)} {byId[l.ingredient_id]?.unit}</span>
              <span className="font-medium flex-1 truncate">{byId[l.ingredient_id]?.name ?? "—"}{l.note && <span className="text-steel font-normal"> · {l.note}</span>}</span>
              <Pill tone={l.reason === "wastage" ? "alert" : l.reason === "sale" ? "served" : "ready"}>{l.reason}{l.reason === "wastage" && l.sub_reason ? ` · ${l.sub_reason}` : ""}</Pill>
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
            <Field label="Pack qty" hint="one pack or scan adds"><input name="pack_qty" type="number" step="0.001" className="num" defaultValue={editing?.pack_qty ?? ""} /></Field>
          </div>
          <Field label="Barcode" hint="Scan the pack on the Scan page to fill this"><input name="barcode" className="num" defaultValue={editing?.barcode ?? ""} /></Field>
          {editing?.id && <PriceHistoryPanel id={editing.id} unit={editing.unit ?? ""} />}
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>
            {editing?.id && <Button type="button" variant="danger" onClick={() => start(async () => { await archiveIngredient(editing.id!); setEditing(null); })}><Trash2 size={16} /></Button>}</div>
        </form>
      </Sheet>

      <Sheet open={!!move} onClose={() => setMove(null)} title={`Adjust · ${move?.name ?? ""}`}>
        <form className="space-y-4" action={(fd) => start(async () => { setErr(null); const r = await moveStock(fd); if (r && "error" in r) setErr(r.error!); else setMove(null); })}>
          <input type="hidden" name="ingredient_id" value={move?.id} />
          <p className="text-sm text-steel">Currently <b className="num">{Number(move?.current_stock).toFixed(2)} {move?.unit}</b></p>
          <Field label="Reason"><select name="reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="opening">Opening balance</option><option value="adjustment">Adjustment (count correction)</option><option value="wastage">Wastage / spoilage</option></select></Field>
          {reason === "wastage"
            ? <Field label="Why was it wasted" hint="the Wastage tab sums these up"><select name="sub_reason" defaultValue="spoilage">{WASTE_REASONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></Field>
            : <Field label="Direction (for adjustment)"><select name="direction" defaultValue="in"><option value="in">Add to stock</option><option value="out">Remove from stock</option></select></Field>}
          <Field label={`Quantity (${move?.unit})`}><input name="qty" type="number" step="0.001" min="0" required className="num" /></Field>
          <Field label="Note"><input name="note" placeholder={reason === "wastage" ? "Fridge off overnight" : "Recounted after delivery"} /></Field>
          {err && <p className="text-sm text-chili">{err}</p>}
          <Button className="w-full" disabled={pending}>Apply</Button>
        </form>
      </Sheet>

      <Sheet open={purchase} onClose={() => setPurchase(false)} title="Record purchase" wide>
        <PurchaseForm ingredients={ingredients} suppliers={suppliers} onDone={() => setPurchase(false)} />
      </Sheet>
    </div>
  );
}

/** What this ingredient has cost lately, and from whom — loaded when the sheet opens. */
function PriceHistoryPanel({ id, unit }: { id: string; unit: string }) {
  const [p, setP] = useState<PriceHistory | null | undefined>(undefined);
  useEffect(() => { let on = true; ingredientPrices(id).then((r) => { if (on) setP("error" in r ? null : r.prices); }); return () => { on = false; }; }, [id]);
  if (p === undefined) return <div className="shimmer h-10" />;
  if (!p || p.history.length === 0) return null;
  return (
    <div className="rounded-xl bg-[var(--color-fill)] p-3 text-xs">
      <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-steel mb-1.5"><History size={12} /> Recent prices <span className="ml-auto normal-case tracking-normal font-normal num">low {formatINR(Number(p.low))} · high {formatINR(Number(p.high))} / {unit}</span></div>
      {p.by_supplier.length > 1 && <div className="mb-1.5 flex flex-wrap gap-1.5">{p.by_supplier.map((s, i) => <span key={i} className="rounded-full bg-card border border-line px-2 py-0.5">{s.supplier ?? "—"}: <b className="num">{formatINR(Number(s.unit_cost))}</b></span>)}</div>}
      <div className="space-y-0.5">{p.history.slice(0, 5).map((h, i) => <div key={i} className="flex justify-between gap-2"><span className="truncate text-steel">{fmtDate(h.on)} · {h.supplier ?? "—"}{h.invoice ? ` · ${h.invoice}` : ""}</span><span className="num shrink-0">{Number(h.qty)} {unit} @ {formatINR(Number(h.unit_cost))}</span></div>)}</div>
    </div>
  );
}

function PurchaseForm({ ingredients, suppliers, onDone }: { ingredients: IngRow[]; suppliers: Supplier[]; onDone: () => void }) {
  const [supplierId, setSupplierId] = useState(""); const [supplier, setSupplier] = useState(""); const [inv, setInv] = useState("");
  const [lines, setLines] = useState([{ ingredient_id: "", qty: 0, unit_cost: 0, packs: false }]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  /* A line bought in packs lands in the ingredient's own unit: 2 packs of a 5 kg bag is 10 kg, at a fifth of the pack price. */
  const toUnits = (l: typeof lines[number]) => { const p = Number(byId[l.ingredient_id]?.pack_qty ?? 0); return l.packs && p > 0 ? { ingredient_id: l.ingredient_id, qty: l.qty * p, unit_cost: l.unit_cost / p } : { ingredient_id: l.ingredient_id, qty: l.qty, unit_cost: l.unit_cost }; };
  const total = lines.map(toUnits).reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const set = (i: number, k: string, v: string | boolean) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: k === "ingredient_id" || k === "packs" ? v : Number(v) } : l)));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Supplier">{suppliers.length ? <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setSupplier(suppliers.find((s) => s.id === e.target.value)?.name ?? ""); }}><option value="">— type a name —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : null}{!supplierId && <input className={suppliers.length ? "mt-2" : ""} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Murugan Traders" />}</Field>
        <Field label="Invoice no."><input value={inv} onChange={(e) => setInv(e.target.value)} /></Field>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_80px_90px_56px_28px] gap-2 text-[11px] uppercase text-steel font-semibold"><span>Ingredient</span><span>Qty</span><span>Cost/unit</span><span>Packs</span><span /></div>
        {lines.map((l, i) => {
          const pack = Number(byId[l.ingredient_id]?.pack_qty ?? 0);
          return (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_56px_28px] gap-2 items-center">
              <select value={l.ingredient_id} onChange={(e) => set(i, "ingredient_id", e.target.value)}><option value="">Choose</option>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select>
              <input type="number" step="0.001" min="0" className="num" value={l.qty || ""} onChange={(e) => set(i, "qty", e.target.value)} placeholder={l.packs ? "packs" : ""} />
              <input type="number" step="0.01" min="0" className="num" value={l.unit_cost || ""} onChange={(e) => set(i, "unit_cost", e.target.value)} placeholder={l.packs ? "per pack" : ""} />
              <label className={cn("flex items-center justify-center gap-1 text-[11px]", pack > 0 ? "text-steel" : "text-line")} title={pack > 0 ? `One pack is ${pack} ${byId[l.ingredient_id].unit}` : "Set a pack size on the ingredient to buy in packs"}><input type="checkbox" className="accent-saffron" disabled={pack <= 0} checked={l.packs} onChange={(e) => set(i, "packs", e.target.checked)} />{pack > 0 ? `×${pack}` : "—"}</label>
              <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-steel hover:text-chili" aria-label="Remove"><Trash2 size={15} /></button>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ingredient_id: "", qty: 0, unit_cost: 0, packs: false }])}><Plus size={14} /> Line</Button>
      </div>
      <div className="flex justify-between items-center border-t border-line pt-3"><span className="text-sm text-steel">Total</span><span className="num text-xl font-semibold">{formatINR(total)}</span></div>
      {err && <p className="text-sm text-chili">{err}</p>}
      <Button className="w-full" disabled={pending} onClick={() => start(async () => { const r = await recordPurchase(supplier, inv, lines.map(toUnits), supplierId || null); if ("error" in r) setErr(r.error!); else onDone(); })}>Add to pantry</Button>
    </div>
  );
}
