"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, PhoneCall, Bike, ShoppingBag, RotateCcw, MapPin, Loader2, UserRound, Delete } from "lucide-react";
import { Card, cn } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatINR } from "@/lib/format";
import { phoneCard, type PhoneCard } from "../actions";

const ago = (iso: string) => { const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
const TYPE: Record<string, string> = { dine_in: "Dine-in", takeaway: "Parcel", delivery: "Delivery", room_service: "Room" };

/**
 * The number first, big, with a keypad for a counter tablet. At ten digits the card comes up: a known caller's name,
 * visits and notes, the address they gave last time (editable), and their last five orders, each with "Same again".
 * Delivery or Parcel then opens the till with all of it filled in (sessionStorage, read once by the till).
 */
export function PhoneClient() {
  const router = useRouter();
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [address, setAddress] = useState("");
  const [card, setCard] = useState<PhoneCard>(null); const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const digits = phone.replace(/\D/g, "").slice(-10);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (digits.length < 10) { setCard(null); return; }
    let on = true; setLoading(true);
    void phoneCard(digits).then((r) => {
      if (!on) return; setLoading(false);
      const c = "card" in r ? r.card ?? null : null; setCard(c);
      if (c?.customer?.name) setName((n) => n || c.customer!.name!);
      const a = c?.customer?.address || c?.last_address; if (a) setAddress((x) => x || a);
    });
    return () => { on = false; };
  }, [digits]);

  const go = (type: "delivery" | "takeaway", items: NonNullable<PhoneCard>["orders"][number]["items"] = []) => {
    try { sessionStorage.setItem("df-phone-order", JSON.stringify({ type, name: name.trim(), phone: digits, address: type === "delivery" ? address.trim() : "", items })); } catch {}
    router.push(`/orders/new?type=${type}&from=phone`);
  };
  const press = (k: string) => setPhone((p) => (k === "del" ? p.slice(0, -1) : (p + k).slice(0, 14)));
  const ready = digits.length === 10;
  /* iPad and desktop (2026-10-24, the owner: "Call option need add here"): call the number back from the counter — tel:
     opens the phone app, or FaceTime / the linked phone on an iPad or a Mac. The phone layout is left as it was. */
  const tel = ready ? `tel:+91${digits}` : undefined;
  const callBtn = (cls: string, data: string) => (
    <a href={tel} aria-disabled={!ready} onClick={(e) => { if (!ready) e.preventDefault(); }} {...{ [data]: true }}
      aria-label={ready ? `Call ${digits.slice(0, 5)} ${digits.slice(5)}` : "Call — type ten digits first"} title={ready ? "Call" : "Type ten digits first"}
      className={cn("hidden sm:inline-flex items-center justify-center gap-2 font-bold transition", ready ? "bg-[var(--color-green)] text-[var(--color-on-tint)] hover:brightness-105 active:scale-95 shadow-[0_10px_22px_-12px_var(--color-green)]" : "bg-[var(--color-fill)] text-[var(--color-label-3)] cursor-not-allowed", cls)}>
      <PhoneCall size={18} aria-hidden /><span className="call-word">Call</span>
    </a>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start" data-phone-order>
      <Card className="min-w-0">
        <label className="block"><span className="text-[13px] font-bold uppercase tracking-wide text-steel">Caller&apos;s number</span>
          <div className="relative mt-2"><Phone size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-steel pointer-events-none" />
            <input ref={input} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} inputMode="tel" autoComplete="off" placeholder="98765 43210" data-phone-input
              className="!h-16 !pl-14 sm:!pr-[7.5rem] !text-[26px] font-extrabold num tracking-wide" />
            {callBtn("absolute right-2 top-1/2 -translate-y-1/2 h-12 px-4 rounded-[14px] text-[15px]", "data-call-number")}</div></label>
        {/* a keypad for the counter tablet; a keyboard works too */}
        <div className="mt-3 grid grid-cols-3 gap-2 [@media(pointer:fine)]:hidden" aria-label="Keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) => k === "" ? <span key={i} /> : (
            <button key={i} type="button" onClick={() => press(k)} className="!min-h-14 rounded-2xl bg-[var(--color-fill)] text-[22px] font-extrabold num grid place-items-center active:scale-95" aria-label={k === "del" ? "Delete" : k}>{k === "del" ? <Delete size={22} /> : k}</button>))}
        </div>
        <label className="block mt-4"><span className="text-[13px] font-semibold text-steel">Name</span><input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Caller's name" data-phone-name /></label>
        <label className="block mt-3"><span className="text-[13px] font-semibold text-steel">Delivery address</span><textarea className="mt-1" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="House, street, landmark" data-phone-address /></label>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={!ready} onClick={() => go("delivery")} className="svc-btn go" data-start-delivery><Bike size={19} aria-hidden /> Delivery</button>
          <button type="button" disabled={!ready} onClick={() => go("takeaway")} className="svc-btn quiet" data-start-parcel><ShoppingBag size={19} aria-hidden /> Parcel</button>
        </div>
        {!ready && <p className="mt-2 text-[12.5px] text-steel">Ten digits, then choose.</p>}
      </Card>

      <div className="space-y-4 min-w-0" aria-live="polite">
        {!ready ? <>
          <div className="sm:hidden feather !rounded-[22px] p-8 text-center text-steel"><Phone size={30} className="mx-auto mb-2 opacity-60" aria-hidden />The caller&apos;s history shows here.</div>
          <EmptyState from="sm" icon={Phone} hue="blue" className="!bg-[var(--color-bg-2)]" data-caller-waiting
            title="The caller's history shows here."
            hint="Type ten digits: their name, last address and last five orders come up, with Same again. Tap Call to ring them back."
            actions={callBtn("h-12 px-6 rounded-full text-[15px]", "data-call-waiting")} />
        </>
          : loading ? <div className="feather !rounded-[22px] p-8 grid place-items-center text-steel"><Loader2 className="animate-spin" /></div> : (<>
          <Card data-caller>
            <div className="flex items-center gap-3">
              <span className="h-14 w-14 shrink-0 rounded-full grid place-items-center bg-[var(--color-fill)]"><UserRound size={26} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[19px] font-extrabold truncate">{card?.customer?.name ?? (name || "New caller")}</div>
                <div className="text-[13.5px] text-steel">{card?.customer ? `${card.customer.visits} visit${card.customer.visits === 1 ? "" : "s"} · ${formatINR(Number(card.customer.spend), { whole: true })} spent${card.customer.last ? ` · last ${ago(card.customer.last)}` : ""}` : "New customer — the order saves them."}</div>
              </div>
              {callBtn("shrink-0 h-12 px-5 rounded-full text-[15px]", "data-call-caller")}
            </div>
            {card?.customer?.notes && <p className="mt-3 rounded-xl bg-[var(--color-orange-2)] text-[var(--color-orange)] px-3 py-2 text-[14px] font-semibold">{card.customer.notes}</p>}
            {(card?.customer?.address || card?.last_address) && <p className="mt-3 flex items-start gap-2 text-[14px]"><MapPin size={16} className="mt-0.5 shrink-0 text-steel" aria-hidden />{card.customer?.address || card.last_address}</p>}
          </Card>
          <Card data-last-orders>
            <div className="text-[15px] font-extrabold mb-2">Last orders</div>
            {!card?.orders?.length ? <p className="text-sm text-steel">No orders from this number yet.</p> : <div className="divide-y divide-[var(--color-separator)]">
              {card.orders.map((o) => { const total = o.items.reduce((a, i) => a + Number(i.price) * i.qty, 0); return (
                <div key={o.id} className="py-3 flex items-start gap-3 min-w-0" data-last-order>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold text-steel">#{o.no} · {TYPE[o.type] ?? o.type} · {ago(o.at)} · <span className="num">{formatINR(total, { whole: true })}</span></div>
                    <div className="text-[14.5px] leading-snug mt-0.5">{o.items.map((i) => `${i.qty}× ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(", ") || "—"}</div>
                  </div>
                  <button type="button" disabled={!o.items.length} onClick={() => go(address.trim() ? "delivery" : "takeaway", o.items)} className={cn("svc-btn quiet sm !px-3 shrink-0")} data-same-again><RotateCcw size={16} aria-hidden /> Same again</button>
                </div>); })}
            </div>}
          </Card>
        </>)}
      </div>
    </div>
  );
}
