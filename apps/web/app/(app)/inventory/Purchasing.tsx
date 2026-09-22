"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2, Send, PackageCheck, XCircle, MessageCircle, Sparkles, Pencil, Truck, Flame } from "lucide-react";
import { Button, Card, Field, Sheet, Empty, Pill, StatTile, cn, useToast } from "@/components/ui";
import { formatINR, fmtDate } from "@/lib/format";
import { savePo, setPoStatus, receivePo, suggestPo, saveSupplier, archiveSupplier, type PoLine } from "./actions";

export type Ing = { id: string; name: string; unit: string; current_stock: number; reorder_level: number; cost_per_unit: number; pack_qty?: number | null };
export type Supplier = { id: string; name: string; phone: string | null; email: string | null; gstin: string | null; address: string | null; notes: string | null; lead_days: number };
export type PoItem = { id: string; ingredient_id: string; qty: number; unit_cost: number; received_qty: number | null };
export type Po = { id: string; po_no: number; status: "draft" | "sent" | "received" | "cancelled"; expected_on: string | null; notes: string | null; total: number; created_at: string; sent_at: string | null; received_at: string | null; supplier_id: string | null; purchase_id: string | null; suppliers: { name: string; phone: string | null } | null; purchase_order_items: PoItem[] };
export type Wastage = { days: number; total_cost: number; lines: number; by_reason: { reason: string; cost: number; lines: number }[]; by_ingredient: { name: string; unit: string; qty: number; cost: number }[]; recent: { name: string; unit: string; qty: number; reason: string; note: string | null; cost: number; at: string }[] } | null;

const tone = (s: Po["status"]) => (s === "received" ? "ready" : s === "sent" ? "preparing" : s === "cancelled" ? "alert" : "pending") as "ready" | "preparing" | "alert" | "pending";
const waTo = (phone: string | null, text: string) => { const d = (phone ?? "").replace(/\D/g, "").slice(-10); return `https://wa.me/${d.length === 10 ? "91" + d : ""}?text=${encodeURIComponent(text)}`; };

/** The order as a message to the supplier: lines typed out, the way it would be dictated on the phone. */
export const poText = (po: Po, byId: Record<string, Ing>, restaurant: string) =>
  [`Purchase order PO-${po.po_no} from ${restaurant}${po.expected_on ? ` · needed by ${fmtDate(po.expected_on)}` : ""}`, "",
    ...po.purchase_order_items.map((l) => `• ${byId[l.ingredient_id]?.name ?? "item"} — ${Number(l.qty)} ${byId[l.ingredient_id]?.unit ?? ""}${Number(l.unit_cost) > 0 ? ` @ ₹${Number(l.unit_cost)}` : ""}`),
    "", po.notes ? po.notes : "", `Total ≈ ${formatINR(Number(po.total))}. Please confirm.`].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");

/* ═══════ purchase orders ═══════ */
export function PurchaseOrders({ orders, suppliers, ingredients, restaurant }: { orders: Po[]; suppliers: Supplier[]; ingredients: Ing[]; restaurant: string }) {
  const [editing, setEditing] = useState<Po | "new" | null>(null);
  const [receiving, setReceiving] = useState<Po | null>(null);
  const [pending, start] = useTransition(); const toast = useToast();
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  const open = orders.filter((o) => o.status === "draft" || o.status === "sent");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel">{open.length ? `${open.length} order${open.length === 1 ? "" : "s"} waiting to arrive.` : "Nothing on order. Draft one from the low-stock list in one press."}</p>
        <Button onClick={() => setEditing("new")}><Plus size={16} /> New order</Button>
      </div>
      {orders.length === 0 ? <Empty title="No purchase orders yet" hint="An order says what to bring, at what price, by when. Send it on WhatsApp; receive it when the van comes and the stock lands." action={<Button onClick={() => setEditing("new")}>Draft the first</Button>} /> : (
        <div className="space-y-2">
          {orders.map((po) => (
            <Card key={po.id}>
              <div className="flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap"><span className="num font-semibold">PO-{po.po_no}</span><Pill tone={tone(po.status)}>{po.status}</Pill><span className="text-sm">{po.suppliers?.name ?? <span className="text-steel">no supplier</span>}</span></div>
                  <div className="text-xs text-steel mt-0.5">{po.purchase_order_items.length} line{po.purchase_order_items.length === 1 ? "" : "s"} · {fmtDate(po.created_at)}{po.expected_on ? ` · expected ${fmtDate(po.expected_on)}` : ""}{po.received_at ? ` · received ${fmtDate(po.received_at)}` : ""}</div>
                  <div className="text-xs text-steel mt-1 truncate">{po.purchase_order_items.map((l) => `${Number(l.qty)} ${byId[l.ingredient_id]?.unit ?? ""} ${byId[l.ingredient_id]?.name ?? "—"}${po.status === "received" && l.received_qty !== null && Number(l.received_qty) !== Number(l.qty) ? ` (got ${Number(l.received_qty)})` : ""}`).join(", ")}</div>
                </div>
                <div className="num font-semibold">{formatINR(Number(po.total))}</div>
                <div className="flex items-center gap-1 w-full sm:w-auto justify-end">
                  {(po.status === "draft" || po.status === "sent") && <>
                    <a href={waTo(po.suppliers?.phone ?? null, poText(po, byId, restaurant))} target="_blank" rel="noreferrer" className="btn btn-outline !h-8 !text-xs" title="Send on WhatsApp" onClick={() => { if (po.status === "draft") start(async () => { await setPoStatus(po.id, "sent"); }); }}><MessageCircle size={13} /> {po.status === "draft" ? "Send" : "Resend"}</a>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(po)} aria-label="Edit"><Pencil size={14} /></Button>
                    <Button size="sm" onClick={() => setReceiving(po)}><PackageCheck size={14} /> Receive</Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Cancel PO-${po.po_no}?`)) start(async () => { const r = await setPoStatus(po.id, "cancelled"); if ("error" in r) toast(r.error!, "err"); }); }} aria-label="Cancel"><XCircle size={14} /></Button>
                  </>}
                  {po.status === "sent" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { await setPoStatus(po.id, "draft"); })} title="Back to draft" aria-label="Back to draft">draft</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" || !editing ? "New purchase order" : `Edit PO-${editing.po_no}`} wide>
        {editing && <PoForm key={editing === "new" ? "new" : editing.id} po={editing === "new" ? null : editing} suppliers={suppliers} ingredients={ingredients} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={!!receiving} onClose={() => setReceiving(null)} title={receiving ? `Receive PO-${receiving.po_no}` : ""} wide>
        {receiving && <ReceiveForm key={receiving.id} po={receiving} ingredients={ingredients} onDone={() => setReceiving(null)} />}
      </Sheet>
    </div>
  );
}

type Row = PoLine & { packs: boolean };
function PoForm({ po, suppliers, ingredients, onDone }: { po: Po | null; suppliers: Supplier[]; ingredients: Ing[]; onDone: () => void }) {
  const [supplier, setSupplier] = useState(po?.supplier_id ?? ""); const [expected, setExpected] = useState(po?.expected_on ?? ""); const [notes, setNotes] = useState(po?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(po ? po.purchase_order_items.map((l) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost), packs: false })) : [{ ingredient_id: "", qty: 0, unit_cost: 0, packs: false }]);
  const [pending, start] = useTransition(); const toast = useToast();
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  /* A line typed in packs is sent in the ingredient's own unit: 3 packs of a 5 kg bag is 15 kg at a fifth of the pack price. */
  const toUnits = (r: Row): PoLine => { const p = Number(byId[r.ingredient_id]?.pack_qty ?? 0); return r.packs && p > 0 ? { ingredient_id: r.ingredient_id, qty: r.qty * p, unit_cost: r.unit_cost / p } : { ingredient_id: r.ingredient_id, qty: r.qty, unit_cost: r.unit_cost }; };
  const total = rows.map(toUnits).reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const fill = () => start(async () => {
    const r = await suggestPo(); if ("error" in r) { toast(r.error!, "err"); return; }
    if (!r.lines.length) { toast("Nothing is below its reorder level."); return; }
    setRows(r.lines.map((l) => ({ ingredient_id: l.ingredient_id, qty: Number(l.qty), unit_cost: Number(l.unit_cost), packs: false })));
    const sup = r.lines.find((l) => l.supplier_id)?.supplier_id; if (sup && !supplier) setSupplier(sup);
    toast(`${r.lines.length} low ingredient${r.lines.length === 1 ? "" : "s"} listed — check the amounts`);
  });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Supplier"><select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">— choose —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Needed by"><input type="date" className="num" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
        <Field label="Note to the supplier"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Morning delivery, back gate" /></Field>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_80px_90px_60px_28px] gap-2 text-[11px] uppercase text-steel font-semibold"><span>Ingredient</span><span>Qty</span><span>Cost/unit</span><span>Packs</span><span /></div>
        {rows.map((r, i) => {
          const ing = byId[r.ingredient_id]; const pack = Number(ing?.pack_qty ?? 0);
          return (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_60px_28px] gap-2 items-center">
              <select value={r.ingredient_id} onChange={(e) => { const g = byId[e.target.value]; set(i, { ingredient_id: e.target.value, unit_cost: r.unit_cost || Number(g?.cost_per_unit ?? 0), packs: false }); }}><option value="">Choose</option>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit}){Number(g.current_stock) <= Number(g.reorder_level) ? " · low" : ""}</option>)}</select>
              <input type="number" step="0.001" min="0" className="num" value={r.qty || ""} onChange={(e) => set(i, { qty: Number(e.target.value) })} placeholder={r.packs ? "packs" : ing?.unit} />
              <input type="number" step="0.01" min="0" className="num" value={r.unit_cost || ""} onChange={(e) => set(i, { unit_cost: Number(e.target.value) })} placeholder={r.packs ? "per pack" : "per unit"} />
              <label className={cn("flex items-center justify-center gap-1 text-[11px]", pack > 0 ? "text-steel" : "text-line")} title={pack > 0 ? `One pack is ${pack} ${ing.unit}` : "Set a pack size on the ingredient to buy in packs"}>
                <input type="checkbox" className="accent-saffron" disabled={pack <= 0} checked={r.packs} onChange={(e) => set(i, { packs: e.target.checked, unit_cost: e.target.checked ? r.unit_cost * pack : pack > 0 ? r.unit_cost / pack : r.unit_cost })} />{pack > 0 ? `×${pack}` : "—"}
              </label>
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-steel hover:text-chili" aria-label="Remove"><Trash2 size={15} /></button>
            </div>
          );
        })}
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { ingredient_id: "", qty: 0, unit_cost: 0, packs: false }])}><Plus size={14} /> Line</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={fill}><Sparkles size={14} /> Fill from low stock</Button>
        </div>
      </div>
      <div className="flex justify-between items-center border-t border-line pt-3"><span className="text-sm text-steel">Total</span><span className="num text-xl font-semibold">{formatINR(total)}</span></div>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const r = await savePo({ id: po?.id ?? null, supplier_id: supplier || null, expected_on: expected || null, notes, lines: rows.map(toUnits) });
        if ("error" in r) toast(r.error!, "err"); else { toast(po ? "Order updated" : "Order drafted — send it on WhatsApp when ready"); onDone(); }
      })}>{po ? "Save changes" : "Save draft"}</Button>
    </div>
  );
}

function ReceiveForm({ po, ingredients, onDone }: { po: Po; ingredients: Ing[]; onDone: () => void }) {
  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  const [inv, setInv] = useState(""); const [on, setOn] = useState(new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10));
  const [got, setGot] = useState<Record<string, { received_qty: number; unit_cost: number }>>(Object.fromEntries(po.purchase_order_items.map((l) => [l.id, { received_qty: Number(l.qty), unit_cost: Number(l.unit_cost) }])));
  const [pending, start] = useTransition(); const toast = useToast();
  const total = Object.values(got).reduce((t, g) => t + g.received_qty * g.unit_cost, 0);
  const short = po.purchase_order_items.filter((l) => (got[l.id]?.received_qty ?? 0) < Number(l.qty));
  return (
    <div className="space-y-4">
      <p className="text-sm text-steel">Tick off what came in the van, at the price on the invoice. Stock lands the moment you save; anything short stays on record against the order.</p>
      <div className="grid grid-cols-2 gap-3"><Field label="Supplier invoice no."><input value={inv} onChange={(e) => setInv(e.target.value)} /></Field><Field label="Received on"><input type="date" className="num" value={on} onChange={(e) => setOn(e.target.value)} /></Field></div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_70px_90px_90px] gap-2 text-[11px] uppercase text-steel font-semibold"><span>Ingredient</span><span>Asked</span><span>Received</span><span>Cost/unit</span></div>
        {po.purchase_order_items.map((l) => (
          <div key={l.id} className="grid grid-cols-[1fr_70px_90px_90px] gap-2 items-center">
            <span className="text-sm truncate">{byId[l.ingredient_id]?.name ?? "—"} <span className="text-xs text-steel">{byId[l.ingredient_id]?.unit}</span></span>
            <span className="num text-sm text-steel">{Number(l.qty)}</span>
            <input type="number" step="0.001" min="0" className={cn("num", (got[l.id]?.received_qty ?? 0) < Number(l.qty) && "!border-[var(--color-orange)]")} value={got[l.id]?.received_qty ?? ""} onChange={(e) => setGot({ ...got, [l.id]: { ...got[l.id], received_qty: Number(e.target.value) } })} />
            <input type="number" step="0.01" min="0" className="num" value={got[l.id]?.unit_cost ?? ""} onChange={(e) => setGot({ ...got, [l.id]: { ...got[l.id], unit_cost: Number(e.target.value) } })} />
          </div>
        ))}
      </div>
      {short.length > 0 && <p className="text-xs text-[var(--color-orange)]">{short.length} line{short.length === 1 ? "" : "s"} short of what was asked — noted on the order.</p>}
      <div className="flex justify-between items-center border-t border-line pt-3"><span className="text-sm text-steel">Goods received</span><span className="num text-xl font-semibold">{formatINR(total)}</span></div>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const r = await receivePo(po.id, po.purchase_order_items.map((l) => ({ id: l.id, received_qty: got[l.id]?.received_qty ?? 0, unit_cost: got[l.id]?.unit_cost ?? Number(l.unit_cost) })), inv, on);
        if ("error" in r) toast(r.error!, "err"); else { toast("Received — the pantry is updated"); onDone(); }
      })}><PackageCheck size={16} /> Receive into the pantry</Button>
    </div>
  );
}

/* ═══════ suppliers ═══════ */
export function Suppliers({ suppliers }: { suppliers: Supplier[] }) {
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [pending, start] = useTransition(); const toast = useToast();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-steel">Who you buy from. A purchase or an order names one, and the price history says what each of them charged.</p><Button onClick={() => setEditing({})}><Plus size={16} /> Supplier</Button></div>
      {suppliers.length === 0 ? <Empty title="No suppliers yet" hint="Add the vegetable vendor, the dairy, the dry-goods wholesaler." action={<Button onClick={() => setEditing({})}>Add the first</Button>} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start gap-2"><Truck size={16} className="text-steel mt-0.5 shrink-0" /><div className="min-w-0 flex-1"><div className="font-semibold truncate">{s.name}</div><div className="text-xs text-steel">{[s.phone, s.gstin ? `GSTIN ${s.gstin}` : null, `${s.lead_days} day lead`].filter(Boolean).join(" · ")}</div>{s.notes && <div className="text-xs text-steel mt-1 line-clamp-2">{s.notes}</div>}</div>
                <div className="flex gap-1">{s.phone && <a href={waTo(s.phone, `Hello ${s.name}, `)} target="_blank" rel="noreferrer" className="inline-grid h-8 w-8 place-items-center rounded-lg text-steel hover:text-mint" aria-label="WhatsApp"><MessageCircle size={15} /></a>}<Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label="Edit"><Pencil size={15} /></Button></div></div>
            </Card>
          ))}
        </div>
      )}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit supplier" : "New supplier"}>
        <form className="space-y-3" action={(fd) => start(async () => { const r = await saveSupplier(fd); if (r && "error" in r) toast(r.error!, "err"); else { toast("Saved"); setEditing(null); } })}>
          {editing?.id && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Name"><input name="name" defaultValue={editing?.name ?? ""} required autoFocus placeholder="Murugan Traders" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Phone" hint="for WhatsApp orders"><input name="phone" className="num" inputMode="tel" defaultValue={editing?.phone ?? ""} /></Field><Field label="Lead days"><input name="lead_days" type="number" min={0} className="num" defaultValue={editing?.lead_days ?? 1} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="GSTIN"><input name="gstin" className="num uppercase" defaultValue={editing?.gstin ?? ""} /></Field><Field label="Email"><input name="email" type="email" defaultValue={editing?.email ?? ""} /></Field></div>
          <Field label="Address"><input name="address" defaultValue={editing?.address ?? ""} /></Field>
          <Field label="Notes"><textarea name="notes" rows={2} defaultValue={editing?.notes ?? ""} placeholder="Delivers Mon/Thu. Pay by the 10th." /></Field>
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>{editing?.id && <Button type="button" variant="danger" disabled={pending} onClick={() => start(async () => { await archiveSupplier(editing.id!); setEditing(null); })} aria-label="Remove"><Trash2 size={16} /></Button>}</div>
        </form>
      </Sheet>
    </div>
  );
}

/* ═══════ wastage ═══════ */
export function WastageView({ w }: { w: Wastage }) {
  if (!w || w.lines === 0) return <Empty title="No wastage recorded" hint="When something is thrown away, log it under Adjust → Wastage with the reason. This page then says what it costs and why." />;
  const max = Math.max(...w.by_reason.map((r) => Number(r.cost)), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={`Wasted · ${w.days} days`} value={formatINR(Number(w.total_cost))} sub={`${w.lines} line${w.lines === 1 ? "" : "s"} logged`} tone="alert" />
        <StatTile label="Biggest reason" value={w.by_reason[0]?.reason ?? "—"} sub={w.by_reason[0] ? formatINR(Number(w.by_reason[0].cost)) : ""} delay={0.05} />
        <StatTile label="Most wasted" value={w.by_ingredient[0]?.name ?? "—"} sub={w.by_ingredient[0] ? `${Number(w.by_ingredient[0].qty)} ${w.by_ingredient[0].unit} · ${formatINR(Number(w.by_ingredient[0].cost))}` : ""} delay={0.1} />
        <StatTile label="A day" value={formatINR(Number(w.total_cost) / w.days)} sub="on average" delay={0.15} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3 flex items-center gap-1.5"><Flame size={13} /> By reason</div>
          <div className="space-y-2">{w.by_reason.map((r) => (
            <div key={r.reason}><div className="flex justify-between text-sm"><span className="capitalize">{r.reason}</span><span className="num">{formatINR(Number(r.cost))} <span className="text-xs text-steel">· {r.lines}</span></span></div>
              <div className="mt-1 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full bg-chili" style={{ width: `${(Number(r.cost) / max) * 100}%` }} /></div></div>
          ))}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-steel mb-3">By ingredient</div>
          <table className="w-full text-sm"><tbody>{w.by_ingredient.map((g) => <tr key={g.name} className="border-t border-line first:border-0"><td className="py-1.5">{g.name}</td><td className="py-1.5 text-right num text-steel">{Number(g.qty)} {g.unit}</td><td className="py-1.5 text-right num font-semibold">{formatINR(Number(g.cost))}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <div className="feather divide-y divide-line">
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel">Recent</div>
        {w.recent.map((r, i) => <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm"><span className="num w-24 text-right text-chili font-semibold">−{Number(r.qty)} {r.unit}</span><span className="flex-1 truncate">{r.name}{r.note ? <span className="text-steel"> · {r.note}</span> : null}</span><Pill tone="alert">{r.reason}</Pill><span className="num text-xs text-steel w-16 text-right">{formatINR(Number(r.cost))}</span><span className="text-xs text-steel hidden sm:block">{fmtDate(r.at)}</span></div>)}
      </div>
    </div>
  );
}
export { Send };
