"use client";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Percent, Plus, Trash2, UtensilsCrossed, Bike, ShoppingBag, Globe } from "lucide-react";
import { Button, Card, Field, Switch, Sheet, Pill, cn, useToast } from "@/components/ui";
import { QR } from "../../labour/LabourClient";
import { formatINR } from "@/lib/format";
import { saveStorefront } from "./actions";
import { saveOffer, deleteOffer } from "../../reservations/actions";

type R = { booking_slug: string | null; name: string; tagline: string | null; cuisines: string[]; price_for_two: number | null; photos: string[]; is_listed: boolean; dining_enabled: boolean; delivery_enabled: boolean; takeaway_enabled: boolean; opens_at: string; closes_at: string; slot_minutes: number; seats_per_slot: number | null; min_order: number; delivery_fee: number; packing_charge: number; delivery_radius_km: number; rating: number | null; rating_count: number };
type O = { id: string; title: string; kind: string; value: number; scope: string; min_order: number; from_time: string | null; to_time: string | null; code: string | null; is_active: boolean };

export function StorefrontSettings({ base, r, offers }: { base: string; r: R; offers: O[] }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [on, setOn] = useState({ listed: r.is_listed, dining: r.dining_enabled, delivery: r.delivery_enabled, takeaway: r.takeaway_enabled });
  const [offer, setOffer] = useState<Partial<O> | null>(null);
  const url = `${base}/dine/${r.booking_slug ?? ""}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <form action={(fd) => start(async () => { const x = await saveStorefront(fd); toast("error" in x ? x.error! : "Storefront saved", "error" in x ? "err" : "ok"); })} className="space-y-5">
          <Card>
            <h2 className="text-xl mb-1">What guests can do</h2>
            <p className="text-xs text-[var(--color-label-2)] mb-4">Switch off anything you are not ready for. Nothing appears publicly until <b>Listed</b> is on.</p>
            <div className="space-y-3">
              {([["listed", "is_listed", "Listed publicly", "Appears at /dine and can be found by search", Globe],
                 ["dining", "dining_enabled", "Table booking", "Guests pick a time slot; it lands on your Reservations screen", UtensilsCrossed],
                 ["delivery", "delivery_enabled", "Delivery", "Orders arrive on your Online orders screen", Bike],
                 ["takeaway", "takeaway_enabled", "Takeaway", "Same, but the guest collects", ShoppingBag]] as const).map(([k, name, title, hint, I]) => (
                <label key={k} className={cn("card p-4 flex items-center gap-3 cursor-pointer", on[k] && "!border-[var(--color-green)]")}>
                  <span className="h-9 w-9 rounded-xl bg-[var(--color-fill)] grid place-items-center shrink-0"><I size={17} /></span>
                  <span className="flex-1"><span className="block font-semibold text-[15px]">{title}</span><span className="block text-xs text-[var(--color-label-2)]">{hint}</span></span>
                  <Switch on={on[k]} onChange={(v) => setOn({ ...on, [k]: v })} />
                  <input type="checkbox" name={name} checked={on[k]} readOnly className="hidden" />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-xl mb-4">How you appear</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Tagline"><input name="tagline" defaultValue={r.tagline ?? ""} placeholder="Coastal Tamil food, cooked to order" /></Field>
              <Field label="Cuisines" hint="Comma separated — guests search on these"><input name="cuisines" defaultValue={r.cuisines?.join(", ")} placeholder="South Indian, Chettinad, Seafood" /></Field>
              <Field label="Price for two (₹)"><input name="price_for_two" type="number" className="num" defaultValue={r.price_for_two ?? ""} /></Field>
              <Field label="Photos" hint="Image links, one per line. First is the cover."><textarea name="photos" rows={2} defaultValue={r.photos?.join("\n")} placeholder="https://…" /></Field>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl mb-1">Table booking</h2>
            <p className="text-xs text-[var(--color-label-2)] mb-4">Slots are generated between these hours. Seats per slot defaults to the total capacity of your tables.</p>
            <div className="grid sm:grid-cols-4 gap-3">
              <Field label="Opens"><input name="opens_at" type="time" className="num" defaultValue={r.opens_at?.slice(0, 5)} /></Field>
              <Field label="Closes"><input name="closes_at" type="time" className="num" defaultValue={r.closes_at?.slice(0, 5)} /></Field>
              <Field label="Slot length"><input name="slot_minutes" type="number" className="num" defaultValue={r.slot_minutes} /></Field>
              <Field label="Seats per slot"><input name="seats_per_slot" type="number" className="num" defaultValue={r.seats_per_slot ?? ""} placeholder="auto" /></Field>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl mb-4">Delivery & takeaway</h2>
            <div className="grid sm:grid-cols-4 gap-3">
              <Field label="Minimum order ₹"><input name="min_order" type="number" className="num" defaultValue={r.min_order} /></Field>
              <Field label="Delivery fee ₹"><input name="delivery_fee" type="number" className="num" defaultValue={r.delivery_fee} /></Field>
              <Field label="Packing ₹"><input name="packing_charge" type="number" className="num" defaultValue={r.packing_charge} /></Field>
              <Field label="Radius km"><input name="delivery_radius_km" type="number" className="num" defaultValue={r.delivery_radius_km} /></Field>
            </div>
          </Card>
          <Button size="lg" loading={pending}>Save storefront</Button>
        </form>

        <Card>
          <div className="flex items-center justify-between mb-1"><h2 className="text-xl">Offers</h2><Button size="sm" onClick={() => setOffer({ kind: "flat_pct", scope: "both", value: 15, is_active: true })}><Plus size={15} /> New offer</Button></div>
          <p className="text-xs text-[var(--color-label-2)] mb-4">These show as chips on your page and on the search list. A time-limited one becomes a “happy hour” badge on those slots.</p>
          {offers.length === 0 ? <p className="text-sm text-[var(--color-label-2)]">No offers yet. A 15% early-evening discount fills tables that would otherwise sit empty.</p> : (
            <div className="space-y-2">{offers.map((o) => (
              <div key={o.id} className="card p-3 flex items-center gap-3">
                <span className="h-9 w-9 rounded-xl bg-[var(--color-champagne-2)] grid place-items-center shrink-0"><Percent size={16} /></span>
                <div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{o.title}</div>
                  <div className="text-xs text-[var(--color-label-2)]">{o.kind === "flat_pct" ? `${o.value}% off` : `${formatINR(o.value)} off`} · {o.scope}{o.min_order > 0 ? ` · above ${formatINR(o.min_order)}` : ""}{o.from_time ? ` · ${o.from_time.slice(0, 5)}–${o.to_time?.slice(0, 5)}` : ""}</div></div>
                {!o.is_active && <Pill tone="served">off</Pill>}
                <Button size="sm" variant="gray" onClick={() => setOffer(o)}>Edit</Button>
                <Button size="sm" variant="plain" onClick={() => { if (confirm(`Remove “${o.title}”?`)) start(() => { deleteOffer(o.id); }); }}><Trash2 size={14} /></Button>
              </div>))}</div>
          )}
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-24 text-center">
        <div className="eyebrow mb-3">Your public page</div>
        <QR value={url} size={150} />
        <div className="num text-xs mt-2 break-all">{url}</div>
        <div className="flex gap-2 mt-3"><Button size="sm" variant="gray" className="flex-1" onClick={() => { navigator.clipboard.writeText(url); toast("Link copied"); }}><Copy size={14} /> Copy</Button>
          <a href={url} target="_blank" rel="noreferrer" className="flex-1"><Button size="sm" className="w-full"><ExternalLink size={14} /> Open</Button></a></div>
        {r.rating && <p className="text-sm mt-4">★ {r.rating} from {r.rating_count} review{r.rating_count === 1 ? "" : "s"}</p>}
        <p className="text-xs text-[var(--color-label-2)] mt-3 text-left">Print the QR for your counter and table tents. Every booking and order through it costs you <b>0% commission</b>, against 18–25% on an aggregator.</p>
      </Card>

      <Sheet open={!!offer} onClose={() => setOffer(null)} title={offer?.id ? "Edit offer" : "New offer"}>
        <form className="space-y-4" action={(fd) => start(async () => { const x = await saveOffer(fd); if ("error" in x) toast(x.error!, "err"); else { setOffer(null); toast("Offer saved"); } })}>
          {offer?.id && <input type="hidden" name="id" value={offer.id} />}
          <Field label="Title" hint="This is what the guest sees"><input name="title" defaultValue={offer?.title} required placeholder="15% off before 7pm" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind"><select name="kind" defaultValue={offer?.kind ?? "flat_pct"}><option value="flat_pct">Percentage off</option><option value="flat_amount">Flat amount off</option></select></Field>
            <Field label="Value"><input name="value" type="number" className="num" defaultValue={offer?.value ?? 15} /></Field>
            <Field label="Applies to"><select name="scope" defaultValue={offer?.scope ?? "both"}><option value="both">Dining and delivery</option><option value="dining">Dining only</option><option value="delivery">Delivery only</option></select></Field>
            <Field label="Minimum order ₹"><input name="min_order" type="number" className="num" defaultValue={offer?.min_order ?? 0} /></Field>
            <Field label="From (optional)"><input name="from_time" type="time" className="num" defaultValue={offer?.from_time?.slice(0, 5) ?? ""} /></Field>
            <Field label="To (optional)"><input name="to_time" type="time" className="num" defaultValue={offer?.to_time?.slice(0, 5) ?? ""} /></Field>
          </div>
          <Field label="Code (optional)"><input name="code" className="num uppercase" defaultValue={offer?.code ?? ""} placeholder="EARLY15" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={offer?.is_active ?? true} className="!w-auto" /> Active</label>
          <Button className="w-full" loading={pending}>Save offer</Button>
        </form>
      </Sheet>
    </div>
  );
}
