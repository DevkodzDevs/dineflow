"use client";
import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, Send, PackageCheck, XCircle, MessageCircle, Sparkles, Pencil, Truck, Flame, Undo2, FilePenLine, Columns2, Columns3, Columns4, Repeat, Phone, type LucideIcon } from "lucide-react";
import { Button, Card, Field, Sheet, Empty, Pill, StatTile, CardStrip, Segmented, cn, useToast, type StripAction } from "@/components/ui";
import { formatINR, fmtDate } from "@/lib/format";
import { savePo, setPoStatus, receivePo, suggestPo, saveSupplier, archiveSupplier, type PoLine } from "./actions";

export type Ing = { id: string; name: string; unit: string; current_stock: number; reorder_level: number; cost_per_unit: number; pack_qty?: number | null };
export type Supplier = { id: string; name: string; phone: string | null; email: string | null; gstin: string | null; address: string | null; notes: string | null; lead_days: number };
export type PoItem = { id: string; ingredient_id: string; qty: number; unit_cost: number; received_qty: number | null };
export type Po = { id: string; po_no: number; status: "draft" | "sent" | "received" | "cancelled"; expected_on: string | null; notes: string | null; total: number; created_at: string; sent_at: string | null; received_at: string | null; supplier_id: string | null; purchase_id: string | null; suppliers: { name: string; phone: string | null } | null; purchase_order_items: PoItem[] };
export type Wastage = { days: number; total_cost: number; lines: number; by_reason: { reason: string; cost: number; lines: number }[]; by_ingredient: { name: string; unit: string; qty: number; cost: number }[]; recent: { name: string; unit: string; qty: number; reason: string; note: string | null; cost: number; at: string }[] } | null;

/** each state its word, colour and picture — the card's icon and badge */
const PO_STATUS: Record<Po["status"], { label: string; hue: string; Icon: LucideIcon }> = { draft: { label: "Draft", hue: "--color-label-2", Icon: FilePenLine }, sent: { label: "Sent", hue: "--color-orange", Icon: Send }, received: { label: "Received", hue: "--color-green", Icon: PackageCheck }, cancelled: { label: "Cancelled", hue: "--color-red", Icon: XCircle } };
/** open orders first (what still needs doing), then received, cancelled last; newest first within each */
const PO_RANK: Record<Po["status"], number> = { sent: 0, draft: 0, received: 1, cancelled: 2 };
/** how many purchase orders across on a desktop — the owner picks 2, 3 or 4 (3 unless chosen; kept on this device) */
type Cols = "2" | "3" | "4";
const COLS_KEY = "df-po-cols";
const COLS_CLASS: Record<Cols, string> = { "2": "lg:grid-cols-2", "3": "lg:grid-cols-3", "4": "lg:grid-cols-4" };
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
  const drafts = open.filter((o) => o.status === "draft"), sent = open.filter((o) => o.status === "sent");
  const [cols, setCols] = useState<Cols>("3");
  useEffect(() => { try { const v = localStorage.getItem(COLS_KEY); if (v === "2" || v === "3" || v === "4") setCols(v); } catch {} }, []);
  const pickCols = (v: Cols) => { setCols(v); try { localStorage.setItem(COLS_KEY, v); } catch {} };
  return (
    <div className="space-y-4">
      {/* the head: what is on order, counted — drafts, sent, its value — and New order (2026-10-21) */}
      <div className="flex flex-wrap items-stretch gap-2" data-po-head>
        <div className="grid grid-cols-3 gap-2 flex-1 min-w-[15rem]">
          {([["Drafts", drafts.length, "--color-label-2"], ["Sent", sent.length, "--color-orange"], ["On order", null, "--color-tint"]] as const).map(([k, n, hue]) => (
            <div key={k} className="min-w-0 rounded-2xl bg-[var(--color-fill)] px-3 py-2.5" data-po-count={k}>
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-steel"><span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: `var(${hue})` }} aria-hidden />{k}</div>
              <div className="mt-0.5 font-display num text-[19px] leading-tight truncate">{n ?? formatINR(open.reduce((t, o) => t + Number(o.total), 0), { whole: true })}</div>
            </div>))}
        </div>
        {orders.length > 0 && <div className="hidden lg:block self-center" data-po-cols aria-label="Cards across"><Segmented<Cols> value={cols} onChange={pickCols}
          options={([["2", Columns2], ["3", Columns3], ["4", Columns4]] as const).map(([v, I]) => ({ value: v, label: <span className="inline-flex items-center gap-1.5" title={`${v} across`}><I size={16} aria-hidden /><span className="num">{v}</span></span> }))} /></div>}
        <button type="button" onClick={() => setEditing("new")} className="svc-btn go sm !px-5 max-sm:w-full sm:self-center" data-new-po><Plus size={17} strokeWidth={2.4} aria-hidden /> New order</button>
      </div>
      {orders.length === 0 ? <Empty title="No purchase orders yet" hint="What to bring, at what price, by when. Send on WhatsApp." action={<Button onClick={() => setEditing("new")}>Draft the first</Button>} /> : (
        <ul className={cn("grid gap-3 md:grid-cols-2 [&>*]:min-w-0", COLS_CLASS[cols])} aria-label="Purchase orders" data-po-grid={cols}>
          {[...orders].sort((a, b) => PO_RANK[a.status] - PO_RANK[b.status]).map((po) => {
            const S = PO_STATUS[po.status]; const live = po.status === "draft" || po.status === "sent";
            const items = po.purchase_order_items;
            /* the card's footer strip: Send (WhatsApp; a draft becomes sent), Edit, Cancel, and Receive — the main move */
            const acts: StripAction[] = live ? [
              { key: "send", label: po.status === "draft" ? "Send" : "Resend", icon: <MessageCircle />, href: waTo(po.suppliers?.phone ?? null, poText(po, byId, restaurant)), external: true, aria: `Send PO-${po.po_no} on WhatsApp`, onClick: () => { if (po.status === "draft") start(async () => { await setPoStatus(po.id, "sent"); }); } },
              { key: "edit", label: "Edit", icon: <Pencil />, aria: `Edit PO-${po.po_no}`, onClick: () => setEditing(po) },
              { key: "cancel", label: "Cancel", icon: <XCircle />, tone: "red", disabled: pending, aria: `Cancel PO-${po.po_no}`, onClick: () => { if (confirm(`Cancel PO-${po.po_no}?`)) start(async () => { const r = await setPoStatus(po.id, "cancelled"); if ("error" in r) toast(r.error!, "err"); }); } },
              { key: "receive", label: "Receive", icon: <PackageCheck />, tone: "go", aria: `Receive PO-${po.po_no}`, onClick: () => setReceiving(po) },
            ] : [
              /* a closed order still has a next move: the same order again, as a new draft */
              { key: "again", label: "Order again", icon: <Repeat />, tone: "go", aria: `Order PO-${po.po_no} again`, onClick: () => setEditing({ ...po, id: "", status: "draft", expected_on: null }) },
            ];
            const more = items.length - 3;
            return (
            <li key={po.id} data-po={po.po_no} data-po-status={po.status} className="feather @container overflow-hidden flex flex-col min-w-0">
              <div className={cn("p-4 flex flex-col gap-3 flex-1 min-w-0", po.status === "cancelled" && "opacity-60")}>
                <div className="flex items-start gap-3 min-w-0">
                  <span aria-hidden className="h-11 w-11 shrink-0 rounded-[12px] grid place-items-center @max-[19rem]:hidden" style={{ background: `color-mix(in srgb, var(${S.hue}) 16%, transparent)`, color: `var(${S.hue})` }}><S.Icon size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold truncate" data-supplier>{po.suppliers?.name ?? <span className="text-steel">No supplier</span>}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-steel min-w-0">
                      <span className="num font-semibold text-[var(--color-label-2)]">PO-{po.po_no}</span><span aria-hidden>·</span>
                      <span>{items.length} line{items.length === 1 ? "" : "s"}</span><span aria-hidden>·</span><span>{fmtDate(po.created_at)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cn("font-display num text-[19px] leading-tight @max-[19rem]:text-[16.5px]", po.status === "cancelled" && "line-through")} data-po-total>{formatINR(Number(po.total))}</div>
                    <span className="mt-1 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap" style={{ background: `color-mix(in srgb, var(${S.hue}) 15%, transparent)`, color: `var(${S.hue})` }} data-status>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />{S.label}
                    </span>
                  </div>
                </div>
                {/* what is on it, as a list in a soft panel that takes the card's spare height — so a one-line order
                    beside a six-line one is a shorter list, not a gap (2026-10-21, the owner: "empty card"); three
                    lines shown, the rest counted */}
                <div className="flex-1 flex flex-col rounded-xl bg-[var(--color-fill)] px-1 pb-1 min-w-0" data-po-lines>
                  <div className="flex items-center justify-between gap-2 min-h-8 px-2.5 text-[11px] font-semibold uppercase tracking-[.1em] text-steel">
                    <span>Items · <span className="num">{items.length}</span></span>
                    {po.status === "sent" && <button type="button" disabled={pending} onClick={() => start(async () => { await setPoStatus(po.id, "draft"); })} className="-mr-1.5 inline-flex items-center gap-1 !min-h-8 px-2 rounded-lg normal-case tracking-normal text-[12px] text-[var(--color-label-2)] hover:bg-[var(--color-fill)]" data-po-undo><Undo2 size={13} aria-hidden /> Back to draft</button>}
                  </div>
                  <ul className="rounded-[10px] bg-[var(--color-card)] divide-y divide-[var(--color-separator)] min-w-0">
                    {items.slice(0, 3).map((l) => { const g = byId[l.ingredient_id]; const short = po.status === "received" && l.received_qty !== null && Number(l.received_qty) !== Number(l.qty); return (
                      <li key={l.id} className="flex items-center gap-2 min-h-9 px-2.5 text-[12.5px] min-w-0">
                        <span className="truncate flex-1 min-w-0">{g?.name ?? "Removed item"}</span>
                        <span className="num shrink-0 text-[var(--color-label-2)]">{Number(l.qty)} {g?.unit ?? ""}{short && <b className="ml-1 text-[var(--color-orange)]">· got {Number(l.received_qty)}</b>}</span>
                        {Number(l.unit_cost) > 0 && <span className="num shrink-0 w-[4.75rem] text-right font-semibold @max-[19rem]:hidden">{formatINR(Number(l.qty) * Number(l.unit_cost), { whole: true })}</span>}
                      </li>); })}
                  </ul>
                  {more > 0 && <div className="px-2.5 pt-1.5 text-[12px] font-semibold text-steel">+{more} more</div>}
                </div>
                <PoTrack po={po} />
              </div>
              {/* one action (Order again) keeps the four-action strip's height at every width — they turn one row at 26rem */}
              <CardStrip actions={acts} data-actions className={cn(acts.length === 1 && "[&>*]:!h-14 @[26rem]:[&>*]:!h-11")} />
            </li>); })}
        </ul>
      )}
      {/* an order with no id is "Order again": the form opens on its lines and saves a new draft */}
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing === "new" || !editing ? "New purchase order" : editing.id ? `Edit PO-${editing.po_no}` : `Order again · as PO-${editing.po_no}`} wide>
        {editing && <PoForm key={editing === "new" ? "new" : editing.id || `again-${editing.po_no}`} po={editing === "new" ? null : editing} suppliers={suppliers} ingredients={ingredients} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={!!receiving} onClose={() => setReceiving(null)} title={receiving ? `Receive PO-${receiving.po_no}` : ""} wide>
        {receiving && <ReceiveForm key={receiving.id} po={receiving} ingredients={ingredients} onDone={() => setReceiving(null)} />}
      </Sheet>
    </div>
  );
}

/** where an order is: Drafted → Sent → Received (or Due, with its date; Cancelled in red) — three dots on one line */
function PoTrack({ po }: { po: Po }) {
  const st = po.status;
  const steps: { k: string; on: boolean; d: string | null; bad?: boolean }[] = [
    { k: "Drafted", on: true, d: po.created_at },
    { k: "Sent", on: st === "sent" || st === "received" || !!po.sent_at, d: po.sent_at },
    st === "cancelled" ? { k: "Cancelled", on: true, d: null, bad: true } : { k: st === "received" ? "Received" : "Due", on: st === "received", d: st === "received" ? po.received_at : po.expected_on },
  ];
  return (
    <ol className="grid grid-cols-3 min-w-0" aria-label="Where this order is" data-po-track>
      {steps.map((x, i) => { const hue = x.bad ? "var(--color-red)" : "var(--color-tint)"; return (
        <li key={x.k} className="relative min-w-0 flex flex-col items-center text-center">
          {i > 0 && <span aria-hidden className="absolute top-[5px] right-1/2 w-full h-[2px] rounded-full" style={{ background: x.on ? hue : "var(--color-separator)" }} />}
          <span aria-hidden className="relative z-[1] h-3 w-3 rounded-full ring-[3px] ring-[var(--color-card)]" style={{ background: x.on ? hue : "var(--color-separator)" }} />
          <span className={cn("mt-1.5 text-[11.5px] font-semibold leading-tight", x.on ? "text-[var(--color-label)]" : "text-steel")} style={x.bad ? { color: hue } : undefined}>{x.k}</span>
          <span className="text-[11px] text-steel num leading-tight">{x.d ? fmtDate(x.d) : x.k === "Due" ? "no date" : "—"}</span>
        </li>); })}
    </ol>
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
        <div className="grid grid-cols-[minmax(0,1fr)_80px_90px_60px_28px] gap-2 text-[11px] uppercase text-steel font-semibold"><span>Ingredient</span><span>Qty</span><span>Cost/unit</span><span>Packs</span><span /></div>
        {rows.map((r, i) => {
          const ing = byId[r.ingredient_id]; const pack = Number(ing?.pack_qty ?? 0);
          return (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_80px_90px_60px_28px] gap-2 items-center">
              <select value={r.ingredient_id} onChange={(e) => { const g = byId[e.target.value]; set(i, { ingredient_id: e.target.value, unit_cost: r.unit_cost || Number(g?.cost_per_unit ?? 0), packs: false }); }}><option value="">Choose</option>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit}){Number(g.current_stock) <= Number(g.reorder_level) ? " · low" : ""}</option>)}</select>
              <input type="number" step="0.001" min="0" className="num" value={r.qty || ""} onChange={(e) => set(i, { qty: Number(e.target.value) })} placeholder={r.packs ? "packs" : ing?.unit} />
              <input type="number" step="0.01" min="0" className="num" value={r.unit_cost || ""} onChange={(e) => set(i, { unit_cost: Number(e.target.value) })} placeholder={r.packs ? "per pack" : "per unit"} />
              <label className={cn("flex items-center justify-center gap-1 text-[11px]", pack > 0 ? "text-steel" : "text-line")} title={pack > 0 ? `One pack is ${pack} ${ing.unit}` : "Set a pack size on the ingredient to buy in packs"}>
                <input type="checkbox" disabled={pack <= 0} checked={r.packs} onChange={(e) => set(i, { packs: e.target.checked, unit_cost: e.target.checked ? r.unit_cost * pack : pack > 0 ? r.unit_cost / pack : r.unit_cost })} />{pack > 0 ? `×${pack}` : "—"}
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
        const r = await savePo({ id: po?.id || null, supplier_id: supplier || null, expected_on: expected || null, notes, lines: rows.map(toUnits) });
        if ("error" in r) toast(r.error!, "err"); else { toast(po?.id ? "Order updated" : "Order drafted — send it on WhatsApp when ready"); onDone(); }
      })}>{po?.id ? "Save changes" : "Save draft"}</Button>
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
      <p className="text-sm text-steel">Tick what came, at the invoice price. Save adds the stock; shortfalls stay on the order.</p>
      <div className="grid grid-cols-2 gap-3"><Field label="Supplier invoice no."><input value={inv} onChange={(e) => setInv(e.target.value)} /></Field><Field label="Received on"><input type="date" className="num" value={on} onChange={(e) => setOn(e.target.value)} /></Field></div>
      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_70px_90px_90px] gap-2 text-[11px] uppercase text-steel font-semibold"><span>Ingredient</span><span>Asked</span><span>Received</span><span>Cost/unit</span></div>
        {po.purchase_order_items.map((l) => (
          <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_70px_90px_90px] gap-2 items-center">
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
/** a supplier's initial sits on one of the board's hues, picked by the name so it never changes */
const SUP_HUES = ["--color-green", "--color-blue", "--color-orange", "--color-violet", "--color-cyan", "--color-red"];
export function Suppliers({ suppliers }: { suppliers: Supplier[] }) {
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [pending, start] = useTransition(); const toast = useToast();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-steel">Who you buy from, and what each one charged.</p><Button onClick={() => setEditing({})}><Plus size={16} /> Supplier</Button></div>
      {suppliers.length === 0 ? <Empty title="No suppliers yet" hint="Add your vegetable, dairy and grocery suppliers." action={<Button onClick={() => setEditing({})}>Add the first</Button>} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {/* A supplier card (2026-10-23, the owner: "modern") built like an OTA channel card: the initial on its own hue, the
              name and what they bring (the notes), the lead time as a pill; a soft panel with the phone and the GSTIN that never
              wraps a line; and Call · WhatsApp · Edit along the foot. */}
          {suppliers.map((s) => { const hue = SUP_HUES[(s.name.charCodeAt(0) || 0) % SUP_HUES.length]; const ph = s.phone?.replace(/\D/g, "") ?? ""; return (
            <div key={s.id} className="feather !rounded-[22px] overflow-hidden flex flex-col min-w-0" data-supplier={s.id}>
              <div className="p-4 pb-3 flex items-start gap-3 min-w-0">
                <span className="h-12 w-12 shrink-0 rounded-[15px] grid place-items-center font-display text-[22px]" style={{ background: `color-mix(in srgb, var(${hue}) 18%, var(--color-bg-2))`, color: `color-mix(in srgb, var(${hue}) 85%, var(--color-label))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(${hue}) 35%, transparent)` }} aria-hidden>{s.name.trim().slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-extrabold leading-tight truncate" title={s.name}>{s.name}</div>
                  <div className="text-[12.5px] text-[var(--color-label-2)] truncate mt-0.5" title={s.notes ?? undefined}>{s.notes || "Supplier"}</div>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-bold bg-[var(--color-fill)] text-[var(--color-label-2)] num" title="Lead time"><Truck size={12} aria-hidden />{s.lead_days}d</span>
              </div>
              <div className="mx-4 mb-4 rounded-2xl bg-[var(--color-fill)] border border-[var(--color-separator)] px-3 py-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div className="min-w-0"><div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)]">Phone</div><div className="text-[13px] font-semibold num truncate mt-0.5">{ph.length === 10 ? `${ph.slice(0, 5)} ${ph.slice(5)}` : s.phone || "—"}</div></div>
                <div className="min-w-0"><div className="text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)]">GSTIN</div><div className="text-[13px] font-semibold num truncate mt-0.5" title={s.gstin ?? undefined}>{s.gstin || "—"}</div></div>
              </div>
              <CardStrip actions={[
                ...(s.phone ? [{ key: "call", label: "Call", icon: <Phone size={16} aria-hidden />, href: `tel:${ph}`, aria: `Call ${s.name}` } as StripAction,
                  { key: "wa", label: "WhatsApp", icon: <MessageCircle size={16} aria-hidden />, href: waTo(s.phone, `Hello ${s.name}, `), external: true, tone: "go", aria: `WhatsApp ${s.name}` } as StripAction] : []),
                { key: "edit", label: "Edit", icon: <Pencil size={15} aria-hidden />, onClick: () => setEditing(s), aria: `Edit ${s.name}` },
              ]} />
            </div>); })}
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
  if (!w || w.lines === 0) return <Empty title="No wastage recorded" hint="Log thrown-away stock under Adjust → Wastage." />;
  const max = Math.max(...w.by_reason.map((r) => Number(r.cost)), 1);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 min-[900px]:grid-cols-4 gap-3">
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
