"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Boxes, Receipt, ClipboardList, Store, BookOpen, Plus, Trash2, Pencil, PackagePlus, AlertTriangle, History, ScanText, Loader2, Camera, CheckCircle2, Droplets, Truck, Search, ScanBarcode, Milk, Drumstick, Fish, Carrot, Apple, Wheat, CupSoda, Package, SprayCan, CircleCheck, CircleAlert, ArrowUp, ArrowDown, ArrowUpDown, ChevronRight, LayoutGrid, Rows3, type LucideIcon } from "lucide-react";
import { Button, Card, Field, Sheet, Empty, Pill, cn, FlapShuffle, useToast } from "@/components/ui";
import { Say } from "@/components/ui/Say";
import { SvcHead } from "@/components/ui/Service";
import type { Word } from "@/lib/say";
import { formatINR, fmtTime, fmtDate } from "@/lib/format";
import { UNITS, INGREDIENT_CATEGORIES, WASTE_REASONS } from "@dineflow/shared";
import { saveIngredient, archiveIngredient, moveStock, recordPurchase, ingredientPrices, readSupplierBill, type PriceHistory, type BillLine } from "./actions";
import { photoToDataUrl } from "@/lib/photo";
import { PurchaseOrders, Suppliers, WastageView, type Ing, type Supplier, type Po, type Wastage } from "./Purchasing";
import { ViewSwitch, useViewPref } from "@/components/ui/ViewSwitch";

type Led = { id: string; ingredient_id: string; qty: number; reason: string; sub_reason?: string | null; note: string | null; created_at: string };
type Pur = { id: string; supplier: string | null; invoice_no: string | null; total: number; purchased_at: string; po_id?: string | null };
type IngRow = Ing & { barcode?: string | null; category?: string | null; brand?: string | null };
type Tab = "stock" | "purchases" | "orders" | "suppliers" | "wastage" | "ledger";
const TAB_ICON: Record<Tab, LucideIcon> = { stock: Boxes, purchases: Receipt, orders: ClipboardList, suppliers: Store, wastage: Trash2, ledger: BookOpen };
type Lvl = "out" | "low" | "ok";
/* the pantry's three colours (globals.css SIMPLE SERVICE): finished red, running low amber, enough green */
const LVL: Record<Lvl, { w: Word; cls: string; Icon: LucideIcon; order: number }> = {
  out: { w: "finished", cls: "st-late", Icon: AlertTriangle, order: 0 }, low: { w: "running_low", cls: "st-cook", Icon: CircleAlert, order: 1 }, ok: { w: "enough", cls: "st-ready", Icon: CircleCheck, order: 2 },
};
/** an ingredient's picture by its category */
const ING_ICON: Record<string, LucideIcon> = { vegetable: Carrot, fruit: Apple, grocery: Wheat, dairy: Milk, meat: Drumstick, seafood: Fish, beverage: CupSoda, packaged: Package, cleaning: SprayCan, other: Package };
/** …and its colour, by the same category (a colour token's name) */
const ING_HUE: Record<string, string> = { vegetable: "green", fruit: "orange", grocery: "orange", dairy: "blue", meat: "red", seafood: "cyan", beverage: "violet", packaged: "violet", cleaning: "cyan", other: "blue" };

/** An ingredient's picture in its kind's own colour (2026-10-20 — the owner could barely see the old one: the state's
    green drawn on the state's green wash, the same on every healthy item). A wash of the hue over the card, a hairline
    of it, and the drawing in the hue mixed a fifth toward the ink — lifted in the dark themes, deepened in the light
    ones, so it reads on all five. A finished or low item also carries a dot in its state's colour on the corner. */
function IngIcon({ cat, level }: { cat: string | null | undefined; level: Lvl }) {
  const I = ING_ICON[cat ?? "other"] ?? Package; const hue = `var(--color-${ING_HUE[cat ?? "other"] ?? "blue"})`;
  return (
    <span className="relative h-12 w-12 shrink-0 rounded-[15px] grid place-items-center" data-ing-icon
      style={{ background: `color-mix(in srgb, ${hue} 17%, var(--color-bg-2))`, color: `color-mix(in srgb, ${hue} 80%, var(--color-label))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue} 36%, transparent)` }}>
      <I size={23} strokeWidth={2.1} aria-hidden />
      {level !== "ok" && <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full" style={{ background: "var(--st)", boxShadow: "0 0 0 2.5px var(--color-bg-2)" }} aria-hidden />}
    </span>
  );
}

export function InventoryClient({ ingredients, ledger, purchases, suppliers = [], orders = [], wastage = null, restaurant = "" }: { ingredients: IngRow[]; ledger: Led[]; purchases: Pur[]; suppliers?: Supplier[]; orders?: Po[]; wastage?: Wastage; restaurant?: string }) {
  const [tab, setTab] = useState<Tab>("stock");
  const [editing, setEditing] = useState<Partial<IngRow> | null>(null);
  const [move, setMove] = useState<IngRow | null>(null);
  const [reason, setReason] = useState("adjustment");
  const [purchase, setPurchase] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* Stock as cards or a grid (2026-10-23): until a default is set on this device, CSS shows the grid from md (every iPad)
     and the cards below it; the pin keeps the shown one as this device's default (df-view:pantry). A grid row opens the item. */
  const lay = useViewPref("pantry", ["cards", "table"] as const); const toast = useToast();
  const layout = lay.chosen ?? "auto";
  const shownAs = lay.chosen ?? (lay.wide === null ? null : lay.wide ? "table" : "cards");
  const [detail, setDetail] = useState<IngRow | null>(null);
  const byId = useMemo(() => Object.fromEntries(ingredients.map((i) => [i.id, i])), [ingredients]);
  const low = ingredients.filter((i) => Number(i.current_stock) <= Number(i.reorder_level));
  const value = ingredients.reduce((t, i) => t + Number(i.current_stock) * Number(i.cost_per_unit), 0);
  const onOrder = orders.filter((o) => o.status === "draft" || o.status === "sent").length;
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "stock", label: "Stock" }, { key: "purchases", label: "Purchases" }, { key: "orders", label: "Orders", badge: onOrder || undefined },
    { key: "suppliers", label: "Suppliers" }, { key: "wastage", label: "Wastage" }, { key: "ledger", label: "Ledger" },
  ];

  /* finished (nothing left), running low (at or under its reorder level), enough — the three colours */
  const levelOf = (i: IngRow): Lvl => (Number(i.current_stock) <= 0 ? "out" : Number(i.current_stock) <= Number(i.reorder_level) ? "low" : "ok");
  const [only, setOnly] = useState<Lvl | null>(null); const [q, setQ] = useState("");
  const shownIngs = ingredients.filter((i) => (!only || levelOf(i) === only) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()) || (i.barcode ?? "").includes(q.trim())))
    .sort((a, b) => LVL[levelOf(a)].order - LVL[levelOf(b)].order || a.name.localeCompare(b.name));
  const n = (l: Lvl) => ingredients.filter((i) => levelOf(i) === l).length;
  /** the bar: the stock against three times its reorder level (full when no level is set and some is in) */
  const barOf = (i: IngRow, l: Lvl) => Math.max(l === "out" ? 3 : 6, Math.min(100, Number(i.reorder_level) > 0 ? (Number(i.current_stock) / (Number(i.reorder_level) * 3)) * 100 : Number(i.current_stock) > 0 ? 100 : 0));
  const fmtStock = (i: IngRow) => { const v = Number(i.current_stock); return i.unit === "pcs" ? String(Math.round(v)) : Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1).replace(/0$/, ""); };

  return (
    <div className="space-y-5">
      <SvcHead icon="pantry" title="Pantry" sub="Red and orange need buying"
        actions={<>
          <Link href="/inventory/leaks" className="svc-btn quiet sm"><Droplets size={17} aria-hidden /> Leak finder</Link>
          <button type="button" className="svc-btn go sm !px-5" onClick={() => setPurchase(true)} data-goods-arrived><Truck size={19} aria-hidden /><Say w="goods_arrived" /></button>
        </>} />
      {/* the six parts as one switch: a 3 × 2 grid of icon tiles on a phone, one row from sm — they were six pills
          in a row that ran off the screen (2026-10-21). + Ingredient belongs to Stock, so it shows there only. */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-2xl bg-[var(--color-fill)]" role="tablist" aria-label="Pantry" data-pantry-tabs>
        {TABS.map((t) => { const I = TAB_ICON[t.key]; const on = tab === t.key; return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)} data-pantry-tab={t.key}
            className={cn("relative min-w-0 !min-h-[3.5rem] sm:!min-h-11 rounded-xl px-1.5 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-[12.5px] sm:text-[13.5px] font-bold transition-colors",
              on ? "bg-[var(--color-bg-2)] text-[var(--color-label)] shadow-feather" : "text-[var(--color-label-2)] hover:bg-[var(--color-fill)]")}>
            <I size={17} className={cn("shrink-0", on && "text-[var(--color-tint)]")} aria-hidden /><span className="truncate max-w-full">{t.label}</span>
            {t.badge ? <span className="num absolute top-1 right-1.5 sm:static min-w-[1.25rem] h-5 px-1 rounded-full grid place-items-center text-[11px] bg-[color-mix(in_srgb,var(--color-orange)_20%,transparent)] text-[var(--color-orange)]">{t.badge}</span> : null}
          </button>); })}
      </div>
      {tab === "stock" && <div className="flex items-center justify-end gap-2">
        {ingredients.length > 0 && <ViewSwitch label="Show stock as" data="pantry" shown={shownAs} onPick={lay.pick} saved={lay.saved} onKeep={(v) => { lay.keep(v); toast(v === "table" ? "The table is your default here" : "Cards are your default here"); }}
          options={[{ v: "cards", label: "Cards", icon: LayoutGrid, word: "Cards" }, { v: "table", label: "Table", icon: Rows3, word: "Table" }]} />}
        <Button variant="outline" className="[@media(pointer:coarse)]:!min-h-11 max-sm:w-full" onClick={() => setEditing({ unit: "kg", reorder_level: 0, cost_per_unit: 0 })}><Plus size={16} /> Ingredient</Button>
      </div>}

      {tab === "stock" && (ingredients.length === 0 ? (
        <Empty title="Pantry is empty" hint="Add items, then record stock" />
      ) : (<>
        {/* three big tiles: how many are finished, running low, enough — tap one to see only those */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3" data-levels>
          {(["out", "low", "ok"] as Lvl[]).map((l) => { const m = LVL[l]; return (
            <button key={l} type="button" onClick={() => setOnly((x) => (x === l ? null : l))} aria-pressed={only === l} className={cn("!min-h-[84px] sm:!min-h-[88px] rounded-[20px] px-3 sm:px-5 flex flex-col sm:flex-row items-start sm:items-center justify-center sm:justify-between gap-1 text-left transition", m.cls, only === l && "ring-2 ring-[var(--st)]")} style={{ background: "var(--st-2)" }} data-level={l}>
              <span className="flex items-center gap-2 text-[14px] sm:text-[16px] font-extrabold min-w-0" style={{ color: "var(--st-ink)" }}><m.Icon size={18} aria-hidden className="shrink-0 max-sm:hidden" /><Say w={m.w} start /></span>
              {/* 2026-10-20: each count shuffles when stock moves it from one level to another (Flap.tsx) */}
              <span className="leading-none" data-level-n={n(l)}><FlapShuffle value={n(l)} pad={0} size="xs" tile="clamp(34px, 8vw, 48px)" bare tone={l === "out" && n(l) > 0 ? "alert" : l === "low" && n(l) > 0 ? "warn" : l === "ok" ? "live" : undefined} say={`${n(l)}`} /></span>
            </button>); })}
        </div>
        {/* what has slipped to its reorder level is already on Tomorrow's buy list (0092); say so here,
            where the store keeper is looking, and offer the purchase order a press away */}
        {low.length > 0 && (() => {
          const listed = low.filter((i) => Number(i.reorder_level) > 0), unset = low.filter((i) => !(Number(i.reorder_level) > 0));
          return (
          <div className="rounded-2xl border border-[var(--color-orange)]/35 bg-[color-mix(in_srgb,var(--color-orange)_8%,var(--color-bg-2))] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" data-low-strip data-listed={listed.length} data-unset={unset.length}>
            <div className="flex-1 min-w-[12rem] text-[13px] text-[var(--color-label-2)]">
              {listed.length > 0 && <><b className="text-[var(--color-label)]">{listed.length} on Tomorrow&apos;s buy list</b>, topped up to twice the level.</>}
              {unset.length > 0 && <> {unset.length} {unset.length === 1 ? "has" : "have"} no reorder level — tap the pencil.</>}
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/tomorrow" className="btn btn-gray !h-10 !px-3.5 !text-[13px]">Tomorrow&apos;s list</Link>
              <button type="button" onClick={() => setTab("orders")} className="btn btn-filled !h-10 !px-3.5 !text-[13px]" data-draft-po>Draft a purchase order</button>
            </div>
          </div>
        ); })()}
        <div className="relative" data-pantry-search><Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item — or type its barcode" aria-label="Find an item" className="!h-14 !rounded-[18px] !pl-12 !pr-14 !text-[16px]" />
          <Link href="/scan" aria-label="Scan a barcode" title="Scan a barcode" className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:right-1.5 rounded-xl grid place-items-center text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]"><ScanBarcode size={19} /></Link>
        </div>
        <div className="text-[12.5px] text-steel -mt-2">Stock value <b className="num text-[var(--color-label)]">{formatINR(value)}</b> at last purchase cost · {ingredients.length} items</div>
        <div className={cn(layout === "table" && "hidden", layout === "auto" && "md:hidden")} data-pantry-cards>
        {/* A phone: a list, one row per item — its picture in its state's colour, the name, the amount big with
            how it stands, a thin bar against three times the reorder level, and two square buttons: + (Add
            stock) and the bin (Waste). A tap on the name opens the item. Low ones first. */}
        <div className="sm:hidden space-y-2" data-pantry-list>
          {shownIngs.map((i) => {
            const l = levelOf(i); const m = LVL[l]; const pct = barOf(i, l);
            return (
              <div key={i.id} className={cn("feather !rounded-[18px] p-3 flex items-center gap-3 min-w-0", m.cls, l !== "ok" && "!border-[color-mix(in_srgb,var(--st)_55%,transparent)]")} data-ing={i.id} data-level={l}>
                <IngIcon cat={i.category} level={l} />
                <button type="button" onClick={() => setEditing(i)} aria-label="Edit" title={`Edit ${i.name}`} className="flex-1 min-w-0 text-left !min-h-0">
                  <span className="block font-bold text-[15px] leading-tight truncate">{i.name}</span>
                  <span className="mt-1 flex items-baseline gap-1 min-w-0">
                    <span className="font-display num text-[22px] leading-none">{fmtStock(i)}</span><span className="text-[13px] font-bold text-steel">{i.unit}</span>
                    <span className="ml-2 text-[12px] font-bold truncate" style={{ color: "var(--st-ink)" }}><Say w={m.w} start /></span>
                  </span>
                  <span className="mt-2 block h-1.5 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--st)" }} /></span>
                </button>
                <button type="button" onClick={() => { setReason("adjustment"); setMove(i); }} aria-label={`Add stock — ${i.name}`} title="Add stock" data-add-stock
                  className="h-12 w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-tint)] text-[var(--color-on-tint)] active:scale-95 transition-transform"><Plus size={22} /></button>
                <button type="button" onClick={() => { setReason("wastage"); setMove(i); }} aria-label={`Waste — ${i.name}`} title="Waste" data-waste
                  className="h-12 w-12 shrink-0 rounded-[14px] grid place-items-center bg-[var(--color-fill)] text-[var(--color-label-2)] hover:text-[var(--color-label)] active:scale-95 transition-transform"><Trash2 size={19} /></button>
              </div>
            );
          })}
          {shownIngs.length === 0 && <p className="text-[15px] text-steel py-6">{q ? `Nothing matches “${q}”.` : "Nothing in this group."}</p>}
        </div>

        {/* A tablet and up: one calm card per item — the picture in a tinted square, the name, how it stands as
            a pill, the amount big with its reorder level, a bar, then Add stock and Waste. Add stock is solid
            green only on an item that needs buying; on the rest it is a soft green, so a full shelf is not a
            wall of bright buttons. */}
        <div className="hidden sm:grid gap-4 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]" data-pantry-grid>
          {shownIngs.map((i) => {
            const l = levelOf(i); const m = LVL[l]; const pct = barOf(i, l);
            return (
              <div key={i.id} className={cn("feather !rounded-[22px] p-4 flex flex-col gap-3.5 min-w-0 transition-shadow hover:shadow-[var(--shadow-pop)]", m.cls, l !== "ok" && "!border-[color-mix(in_srgb,var(--st)_55%,transparent)]")} data-ing={i.id} data-level={l}>
                <div className="flex items-start gap-3 min-w-0">
                  <IngIcon cat={i.category} level={l} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[16px] leading-snug truncate" title={i.name}>{i.name}</div>
                    <span className="mt-1 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-bold" style={{ background: "var(--st-2)", color: "var(--st-ink)" }}><m.Icon size={12} aria-hidden /><Say w={m.w} start /></span>
                  </div>
                  <button type="button" onClick={() => setEditing(i)} aria-label="Edit" title={`Edit ${i.name}`} className="h-10 w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 -mr-1.5 -mt-1 shrink-0 rounded-xl grid place-items-center text-steel hover:text-[var(--color-label)] hover:bg-[var(--color-fill)]"><Pencil size={16} /></button>
                </div>
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="font-display num text-[34px] leading-none">{fmtStock(i)}</span><span className="text-[14px] font-bold text-steel">{i.unit}</span>
                  <span className="ml-auto text-[12px] text-steel num truncate">reorder at {Number(i.reorder_level)} {i.unit}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--st)" }} /></div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 mt-auto">
                  <button type="button" className={cn("svc-btn sm !gap-1.5 !px-3", l === "ok" ? "st-ready" : "go")} style={l === "ok" ? { background: "var(--st-2)", color: "var(--st-ink)" } : undefined} onClick={() => { setReason("adjustment"); setMove(i); }} data-add-stock><Plus size={17} aria-hidden /><Say w="add_stock" /></button>
                  <button type="button" className="svc-btn quiet sm !px-3.5 !gap-1.5" onClick={() => { setReason("wastage"); setMove(i); }} aria-label={`Waste — ${i.name}`} data-waste><Trash2 size={16} aria-hidden /><Say w="waste" /></button>
                </div>
              </div>
            );
          })}
          {shownIngs.length === 0 && <p className="col-span-full text-[15px] text-steel py-6">{q ? `Nothing matches “${q}”.` : "Nothing in this group."}</p>}
        </div>
        </div>
        <div className={cn(layout === "cards" && "hidden", layout === "auto" && "hidden md:block")}>
          {shownIngs.length === 0 ? <p className="text-[15px] text-steel py-6">{q ? `Nothing matches “${q}”.` : "Nothing in this group."}</p>
            : <PantryGrid rows={shownIngs} levelOf={levelOf} fmtStock={fmtStock} barOf={barOf} onOpen={setDetail} onMove={(i, why) => { setReason(why); setMove(i); }} />}
        </div>
      </>))}

      {tab === "purchases" && (purchases.length === 0 ? <Empty title="No purchases recorded" hint="Bills add stock to the pantry" /> : (
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
          {ledger.length === 0 && <p className="p-6 text-sm text-steel">Every stock change shows here.</p>}
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

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ""}>
        {detail && (() => { const i = ingredients.find((x) => x.id === detail.id) ?? detail; const l = levelOf(i); return (
          <ItemDetail i={i} l={l} stock={fmtStock(i)} pct={barOf(i, l)} moves={ledger.filter((v) => v.ingredient_id === i.id)}
            onMove={(why) => { setDetail(null); setReason(why); setMove(i); }} onEdit={() => { setDetail(null); setEditing(i); }} />); })()}
      </Sheet>
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
          <Field label="Barcode" hint="Fill from the Scan page"><input name="barcode" className="num" defaultValue={editing?.barcode ?? ""} /></Field>
          {editing?.id && <PriceHistoryPanel id={editing.id} unit={editing.unit ?? ""} />}
          {err && <p className="text-sm text-chili">{err}</p>}
          <div className="flex gap-2"><Button className="flex-1" disabled={pending}>Save</Button>
            {editing?.id && <Button type="button" variant="danger" onClick={() => start(async () => { const r = await archiveIngredient(editing.id!); if ("error" in r) return void setErr(r.error!); setEditing(null); })}><Trash2 size={16} /></Button>}</div>
        </form>
      </Sheet>

      <Sheet open={!!move} onClose={() => setMove(null)} title={`${reason === "wastage" ? "Waste" : "Add or correct stock"} · ${move?.name ?? ""}`}>
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
  /* A photographed supplier bill fills the form. Lines it could match land as rows to check;
     lines for things the pantry does not stock are listed apart, to add as ingredients first.
     Nothing is saved until "Add to pantry", exactly as when the form is typed. */
  const [reading, setReading] = useState(false);
  const [readNote, setReadNote] = useState<{ sample?: boolean; read: number; unmatched: BillLine[] } | null>(null);
  const scanBill = async (file: File) => {
    setErr(null); setReading(true);
    try {
      const r = await readSupplierBill(await photoToDataUrl(file));
      if ("error" in r) { setErr(r.error); return; }
      const known = r.lines.filter((l) => l.ingredient_id);
      if (r.supplier) { const sup = suppliers.find((x) => x.name.trim().toLowerCase() === r.supplier.trim().toLowerCase()); setSupplierId(sup?.id ?? ""); setSupplier(sup?.name ?? r.supplier); }
      if (r.invoice_no) setInv(r.invoice_no);
      if (known.length) setLines(known.map((l) => ({ ingredient_id: l.ingredient_id!, qty: l.qty, unit_cost: l.unit_cost, packs: false })));
      setReadNote({ sample: r.sample, read: known.length, unmatched: r.lines.filter((l) => !l.ingredient_id) });
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that photo."); }
    finally { setReading(false); }
  };
  /* A line bought in packs lands in the ingredient's own unit: 2 packs of a 5 kg bag is 10 kg, at a fifth of the pack price. */
  const toUnits = (l: typeof lines[number]) => { const p = Number(byId[l.ingredient_id]?.pack_qty ?? 0); return l.packs && p > 0 ? { ingredient_id: l.ingredient_id, qty: l.qty * p, unit_cost: l.unit_cost / p } : { ingredient_id: l.ingredient_id, qty: l.qty, unit_cost: l.unit_cost }; };
  const total = lines.map(toUnits).reduce((t, l) => t + l.qty * l.unit_cost, 0);
  const set = (i: number, k: string, v: string | boolean) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: k === "ingredient_id" || k === "packs" ? v : Number(v) } : l)));
  const count = lines.filter((l) => l.ingredient_id).length;
  return (
    <div className="space-y-5">
      {/* Scan: a real card with one obvious action, not a faint dashed box. */}
      <label className={cn("flex items-center gap-4 rounded-2xl border p-4 cursor-pointer transition-colors", reading ? "border-[var(--color-tint)] bg-[var(--color-green-2)]" : "border-[var(--color-separator)] hover:border-[var(--color-tint)]")}>
        <span className="h-12 w-12 rounded-2xl grid place-items-center shrink-0 bg-[var(--color-green-2)] text-[var(--color-green)]">{reading ? <Loader2 size={22} className="animate-spin" /> : <ScanText size={22} />}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold">{reading ? "Reading the bill…" : readNote ? "Scan another bill" : "Scan the supplier bill"}</span>
          <span className="block text-xs text-[var(--color-label-2)] mt-0.5">Take a photo, then check it.</span>
        </span>
        <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 h-10 px-4 rounded-full bg-[var(--color-tint)] text-[var(--color-on-tint)] text-sm font-semibold"><Camera size={15} /> Take photo</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only !w-px !h-px !min-w-0 !p-0 !border-0" disabled={reading}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void scanBill(f); }} />
      </label>

      {readNote && (
        <div className="rounded-2xl border border-[var(--color-separator)] overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-[var(--color-green-2)]">
            <CheckCircle2 size={16} className="text-[var(--color-green)] shrink-0" />
            <span className="flex-1 min-w-0 text-[13.5px] font-semibold truncate">{readNote.read} item{readNote.read === 1 ? "" : "s"} read{supplier ? ` · ${supplier}` : ""}</span>
            {readNote.sample && <Pill tone="gold">sample</Pill>}
          </div>
          <div className="px-4 py-3 space-y-3 text-xs">
            <p className="text-[var(--color-label-2)]">Check each item below before adding.{readNote.sample ? " Sample only: ask support to enable." : ""}</p>
            {readNote.unmatched.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 font-semibold text-[var(--color-orange)]"><AlertTriangle size={13} className="shrink-0" /> Not in your pantry yet</div>
                <div className="flex flex-wrap gap-1.5 mt-2">{readNote.unmatched.map((l, k) => (
                  <span key={k} className="inline-flex items-center h-7 px-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-orange)_14%,transparent)] text-[var(--color-orange)] font-semibold">{l.name} · {l.qty} × ₹{l.unit_cost}</span>))}</div>
                <p className="text-[var(--color-label-2)] mt-2">Add them as ingredients first.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
        <Field label="Supplier">{suppliers.length ? <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setSupplier(suppliers.find((s) => s.id === e.target.value)?.name ?? ""); }}><option value="">— type a name —</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : null}{!supplierId && <input className={suppliers.length ? "mt-2" : ""} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Murugan Traders" />}</Field>
        <Field label="Invoice no."><input value={inv} onChange={(e) => setInv(e.target.value)} /></Field>
      </div>

      {/* Items: one card per line. The ingredient across the top; quantity, cost, packs and the
          line's own total underneath, each labelled where it sits. */}
      <div>
        <div className="flex items-center mb-2.5"><span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-steel">Items</span><span className="num ml-2 h-5 min-w-5 px-1.5 rounded-full bg-[var(--color-fill)] text-[11px] font-bold grid place-items-center">{lines.length}</span></div>
        <div className="space-y-2.5">
          {lines.map((l, i) => {
            const ing = byId[l.ingredient_id]; const pack = Number(ing?.pack_qty ?? 0); const u = toUnits(l);
            return (
              <div key={i} className="rounded-2xl border border-[var(--color-separator)] p-3">
                <div className="flex items-center gap-2">
                  <select className="flex-1 min-w-0" value={l.ingredient_id} onChange={(e) => set(i, "ingredient_id", e.target.value)} aria-label="Ingredient"><option value="">Choose an ingredient</option>{ingredients.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}</select>
                  <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} className="icon-btn !rounded-full shrink-0 text-steel hover:text-chili hover:bg-[var(--color-fill)]" aria-label="Remove this item"><Trash2 size={16} /></button>
                </div>
                <div className="mt-2.5 grid gap-2.5 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14.5rem] items-end">
                  <Field label={l.packs ? "Packs" : `Qty${ing ? ` (${ing.unit})` : ""}`}><input type="number" step="0.001" min="0" inputMode="decimal" className="num" value={l.qty || ""} onChange={(e) => set(i, "qty", e.target.value)} placeholder="0" /></Field>
                  <Field label={l.packs ? "Price per pack ₹" : "Cost per unit ₹"}><input type="number" step="0.01" min="0" inputMode="decimal" className="num" value={l.unit_cost || ""} onChange={(e) => set(i, "unit_cost", e.target.value)} placeholder="0.00" /></Field>
                  <div className="col-span-2 sm:col-span-1 flex items-center gap-3 sm:pb-0.5">
                    {pack > 0 && (
                      <button type="button" aria-pressed={l.packs} onClick={() => set(i, "packs", !l.packs)} title={`One pack is ${pack} ${ing!.unit}`}
                        className={cn("min-h-10 px-3 rounded-full text-xs font-semibold transition-colors whitespace-nowrap", l.packs ? "bg-[var(--color-tint)] text-[var(--color-on-tint)]" : "bg-[var(--color-fill)] text-[var(--color-label-2)]")}>In packs of {pack}</button>
                    )}
                    <span className="ml-auto text-right"><span className="block text-[11px] text-steel">Line total</span><span className="num font-semibold text-[15px] whitespace-nowrap">{formatINR(u.qty * u.unit_cost)}</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="outline" size="sm" className="mt-2.5" onClick={() => setLines([...lines, { ingredient_id: "", qty: 0, unit_cost: 0, packs: false }])}><Plus size={14} /> Add item</Button>
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-[var(--color-separator)] pt-4">
        <span><span className="block text-sm text-steel">Total</span><span className="block text-xs text-[var(--color-label-2)]">{count} item{count === 1 ? "" : "s"} · added to stock at these costs</span></span>
        <span className="num font-display text-[26px] leading-none">{formatINR(total)}</span>
      </div>
      {err && <p className="text-sm text-chili">{err}</p>}
      <Button size="lg" className="w-full" disabled={pending} onClick={() => start(async () => { const r = await recordPurchase(supplier, inv, lines.map(toUnits), supplierId || null); if ("error" in r) setErr(r.error!); else onDone(); })}><PackagePlus size={17} /> Add to pantry</Button>
    </div>
  );
}

type GridKey = "name" | "state" | "stock" | "reorder" | "cost" | "value" | "category" | "barcode";
/**
 * Pantry as a data grid (2026-10-23, the owner: "a grid, a row opens the product in a dialog, the cards untouched; the grid
 * from an iPad up, cards on a phone, and a default I can set"). Every column but the last sorts; the low ones come first
 * until a column is chosen. Add stock (+) and Waste (bin) are round keys at the row's end that do not open it. Columns come
 * with the grid's own room (container queries): Item, In stock and the keys always; State from 36rem; Reorder at from 44;
 * Cost and Value from 54; Category and Barcode from 70.
 */
function PantryGrid({ rows, levelOf, fmtStock, barOf, onOpen, onMove }: {
  rows: IngRow[]; levelOf: (i: IngRow) => Lvl; fmtStock: (i: IngRow) => string; barOf: (i: IngRow, l: Lvl) => number;
  onOpen: (i: IngRow) => void; onMove: (i: IngRow, why: "adjustment" | "wastage") => void;
}) {
  const [sort, setSort] = useState<{ key: GridKey; dir: 1 | -1 } | null>(null);
  const AT: Partial<Record<GridKey, string>> = { state: "hidden @[36rem]:table-cell", reorder: "hidden @[44rem]:table-cell", cost: "hidden @[54rem]:table-cell", value: "hidden @[54rem]:table-cell", category: "hidden @[70rem]:table-cell", barcode: "hidden @[70rem]:table-cell" };
  const COLS: { key: GridKey; label: string }[] = [{ key: "name", label: "Item" }, { key: "state", label: "State" }, { key: "stock", label: "In stock" }, { key: "reorder", label: "Reorder at" }, { key: "cost", label: "Cost / unit" }, { key: "value", label: "Value" }, { key: "category", label: "Category" }, { key: "barcode", label: "Barcode" }];
  const num = (x: unknown) => Number(x ?? 0);
  const by: Record<GridKey, (a: IngRow, b: IngRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name), state: (a, b) => LVL[levelOf(a)].order - LVL[levelOf(b)].order,
    stock: (a, b) => num(a.current_stock) - num(b.current_stock), reorder: (a, b) => num(a.reorder_level) - num(b.reorder_level),
    cost: (a, b) => num(a.cost_per_unit) - num(b.cost_per_unit), value: (a, b) => num(a.current_stock) * num(a.cost_per_unit) - num(b.current_stock) * num(b.cost_per_unit),
    category: (a, b) => (a.category ?? "~").localeCompare(b.category ?? "~"), barcode: (a, b) => (a.barcode ?? "~").localeCompare(b.barcode ?? "~"),
  };
  const list = sort ? [...rows].sort((a, b) => by[sort.key](a, b) * sort.dir || a.name.localeCompare(b.name)) : rows;
  const flip = (k: GridKey) => setSort((s) => (!s || s.key !== k ? { key: k, dir: 1 } : s.dir === 1 ? { key: k, dir: -1 } : null));
  const cell = (k: GridKey | "keys", extra?: string) => cn("px-3.5 py-2.5 align-middle border-b border-[var(--color-separator)]", k !== "keys" && AT[k], extra);
  const key = "h-9 w-9 !min-h-9 pointer-coarse:h-11 pointer-coarse:w-11 pointer-coarse:!min-h-11 rounded-full grid place-items-center transition-colors";
  return (
    <div className="rounded-[24px] border border-[var(--color-separator)] bg-[var(--color-bg-2)] overflow-hidden" data-pantry-table>
      <div className="@container overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left" aria-label="Pantry">
          <thead><tr>
            {COLS.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3.5 h-11 bg-[color-mix(in_srgb,var(--color-bg-2)_92%,var(--color-bg-3))] border-b border-[var(--color-separator)] whitespace-nowrap", AT[c.key])} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                <button type="button" onClick={() => flip(c.key)} className="!min-h-0 h-11 inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[.08em] text-[var(--color-label-2)] hover:text-[var(--color-label)]" data-sort={c.key}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />) : <ArrowUpDown size={13} className="opacity-40" aria-hidden />}</button>
              </th>))}
            <th className="w-[1%] bg-[color-mix(in_srgb,var(--color-bg-2)_92%,var(--color-bg-3))] border-b border-[var(--color-separator)]" aria-hidden />
          </tr></thead>
          <tbody>
            {list.map((i) => { const l = levelOf(i); const m = LVL[l]; const pct = barOf(i, l); return (
              <tr key={i.id} tabIndex={0} data-pantry-row={i.id} data-level={l} aria-label={`${i.name} — open`} className={cn("cursor-pointer transition-colors hover:bg-[var(--color-fill)] focus-visible:outline-2 focus-visible:outline-[var(--color-tint)] focus-visible:-outline-offset-2", m.cls)}
                onClick={() => onOpen(i)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(i); } }}>
                <td className={cell("name", "min-w-[13rem] max-w-[20rem]")}>
                  <div className="flex items-center gap-3 min-w-0"><span className="scale-[.8] -m-1.5 shrink-0"><IngIcon cat={i.category} level={l} /></span>
                    <div className="min-w-0"><div className="text-[14.5px] font-extrabold truncate">{i.name}</div>{i.brand && <div className="text-[11.5px] text-[var(--color-label-2)] truncate mt-0.5">{i.brand}</div>}</div></div></td>
                <td className={cell("state")}><span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-bold whitespace-nowrap" style={{ background: "var(--st-2)", color: "var(--st-ink)" }}><m.Icon size={12} aria-hidden /><Say w={m.w} start /></span></td>
                <td className={cell("stock", "min-w-[8rem]")}>
                  <div className="flex items-baseline gap-1"><span className="font-display num text-[19px] leading-none">{fmtStock(i)}</span><span className="text-[12px] font-bold text-steel">{i.unit}</span></div>
                  <div className="mt-1.5 h-1.5 w-24 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--st)" }} /></div></td>
                <td className={cell("reorder")}><span className="num text-[13px] whitespace-nowrap">{num(i.reorder_level)} {i.unit}</span></td>
                <td className={cell("cost")}><span className="num text-[13px] whitespace-nowrap">{formatINR(num(i.cost_per_unit))}</span></td>
                <td className={cell("value")}><span className="num text-[13px] font-semibold whitespace-nowrap">{formatINR(num(i.current_stock) * num(i.cost_per_unit), { whole: true })}</span></td>
                <td className={cell("category")}><span className="text-[13px] capitalize">{i.category ?? "—"}</span></td>
                <td className={cell("barcode")}><span className="num text-[12.5px] text-[var(--color-label-2)]">{i.barcode || "—"}</span></td>
                <td className={cell("keys", "pr-3")}>
                  <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => onMove(i, "adjustment")} className={cn(key, l === "ok" ? "bg-[var(--st-2)] text-[var(--st-ink)]" : "bg-[var(--color-tint)] text-[var(--color-on-tint)]")} aria-label={`Add stock — ${i.name}`} title="Add stock" data-add-stock><Plus size={16} aria-hidden /></button>
                    <button type="button" onClick={() => onMove(i, "wastage")} className={cn(key, "bg-[var(--color-fill)] text-[var(--color-label-2)] hover:text-[var(--color-label)]")} aria-label={`Waste — ${i.name}`} title="Waste" data-waste><Trash2 size={15} aria-hidden /></button>
                    <ChevronRight size={16} className="text-[var(--color-label-3)] ml-0.5" aria-hidden />
                  </div></td>
              </tr>); })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One product, opened from a grid row (2026-10-23): how it stands, the numbers that matter, its last stock moves and prices,
 *  and the three moves — Add stock, Waste, Edit — each closing this first and opening its own sheet. */
function ItemDetail({ i, l, stock, pct, moves, onMove, onEdit }: { i: IngRow; l: Lvl; stock: string; pct: number; moves: Led[]; onMove: (why: "adjustment" | "wastage") => void; onEdit: () => void }) {
  const m = LVL[l]; const num = (x: unknown) => Number(x ?? 0);
  const fact = (label: string, value: string, data?: string) => (
    <div className="rounded-2xl bg-[var(--color-fill)] px-3.5 py-3 min-w-0" data-fact={data}><div className="text-[11px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)]">{label}</div><div className="mt-1 font-display num text-[20px] leading-tight truncate">{value}</div></div>);
  return (
    <div className={cn("space-y-4", m.cls)} data-item-detail={i.id}>
      <div className="flex items-center gap-3 min-w-0">
        <IngIcon cat={i.category} level={l} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-[var(--color-label-2)] truncate capitalize">{[i.category, i.brand].filter(Boolean).join(" · ") || "Ingredient"}</div>
          <span className="mt-1 inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-bold" style={{ background: "var(--st-2)", color: "var(--st-ink)" }}><m.Icon size={12} aria-hidden /><Say w={m.w} start /></span>
        </div>
      </div>
      <div className="rounded-[20px] border border-[color-mix(in_srgb,var(--st)_40%,transparent)] p-4" style={{ background: "color-mix(in srgb, var(--st) 7%, var(--color-bg-2))" }}>
        <div className="flex items-baseline gap-1.5"><span className="font-display num text-[40px] leading-none">{stock}</span><span className="text-[15px] font-bold text-steel">{i.unit}</span><span className="ml-auto text-[12.5px] text-steel num">reorder at {num(i.reorder_level)} {i.unit}</span></div>
        <div className="mt-3 h-2 rounded-full bg-[var(--color-fill-2)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--st)" }} /></div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {fact("Cost / unit", formatINR(num(i.cost_per_unit)), "cost")}{fact("Stock value", formatINR(num(i.current_stock) * num(i.cost_per_unit), { whole: true }), "value")}
        {fact("Pack", i.pack_qty ? `${num(i.pack_qty)} ${i.unit}` : "—", "pack")}{fact("Barcode", i.barcode || "—", "barcode")}
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.06em] text-[var(--color-label-2)] mb-1.5">Last moves</div>
        {moves.length === 0 ? <p className="text-[13px] text-steel">No stock moves yet.</p> : (
          <div className="rounded-2xl border border-[var(--color-separator)] divide-y divide-[var(--color-separator)]">
            {moves.slice(0, 6).map((v) => <div key={v.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
              <span className={cn("num font-bold w-20 shrink-0", num(v.qty) < 0 ? "text-[var(--color-red)]" : "text-[var(--color-green)]")}>{num(v.qty) > 0 ? "+" : ""}{num(v.qty).toFixed(num(v.qty) % 1 ? 2 : 0)}</span>
              <span className="flex-1 min-w-0 truncate capitalize">{v.reason}{v.sub_reason ? ` · ${v.sub_reason}` : ""}{v.note ? <span className="text-steel normal-case"> · {v.note}</span> : null}</span>
              <span className="text-[12px] text-steel num shrink-0">{fmtDate(v.created_at)}</span></div>)}
          </div>)}
      </div>
      <PriceHistoryPanel id={i.id} unit={i.unit} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
        <button type="button" className={cn("svc-btn sm !gap-1.5", l === "ok" ? "st-ready" : "go")} style={l === "ok" ? { background: "var(--st-2)", color: "var(--st-ink)" } : undefined} onClick={() => onMove("adjustment")} data-detail-add><Plus size={17} aria-hidden /><Say w="add_stock" /></button>
        <button type="button" className="svc-btn quiet sm !px-3.5 !gap-1.5" onClick={() => onMove("wastage")} data-detail-waste><Trash2 size={16} aria-hidden /><Say w="waste" /></button>
        <button type="button" className="svc-btn quiet sm !px-3.5 !gap-1.5" onClick={onEdit} data-detail-edit><Pencil size={15} aria-hidden />Edit</button>
      </div>
    </div>
  );
}
