"use client";
import { useState, useTransition } from "react";
import { Bike, Check, Copy, MessageCircle, UserRound } from "lucide-react";
import { Button, Sheet, Field, cn, useToast } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { waHref, firstName } from "@/lib/wa";
import { assignRider } from "./actions";

export type Rider = { id: string; full_name: string; phone: string | null };
export type Delivery = { online_order_id: string | null; rider_name: string | null; rider_phone: string | null; status: string; token: string; rider_token: string; located_at: string | null; eta_min: number | null; picked_up_at: string | null; delivered_at: string | null };
type Order = { id: string; display_id: string | null; external_id: string; customer_name: string | null; customer_phone: string | null; address: string | null; track_token?: string | null };

/** the two WhatsApp messages: the rider's page, and the customer's tracking link */
export const riderText = (base: string, o: Order, riderToken: string, property: string) => `Hi, delivery for ${property}: order ${o.display_id ?? o.external_id} for ${o.customer_name ?? "the customer"}${o.address ? `, ${o.address}` : ""}. Open your delivery page: ${base}/ride/${riderToken}`;
export const customerText = (base: string, o: Order, rider: string | null, property: string, trackToken: string) => `Hi ${firstName(o.customer_name ?? "")}, your ${property} order ${o.display_id ?? o.external_id} is on its way${rider ? ` with ${rider}` : ""}. Track it live: ${base}/track/${trackToken}`;

/**
 * Send out (0140): who rides this order — a rider from Staff in one tap, or any name and phone — and how long it should take;
 * then the two links to send on WhatsApp (the rider's page, the customer's tracking page), or to copy. Assigning again
 * re-points the same links at the new rider.
 */
export function AssignRider({ order, riders, base, property, existing, onClose }: { order: Order | null; riders: Rider[]; base: string; property: string; existing: Delivery | null; onClose: () => void }) {
  const toast = useToast(); const [pending, start] = useTransition();
  const [pick, setPick] = useState<string | "other">(riders[0]?.id ?? "other");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [eta, setEta] = useState<number>(25);
  const [done, setDone] = useState<{ track: string; ride: string; rider: string | null; phone: string | null } | null>(existing ? { track: order?.track_token ?? existing.token, ride: existing.rider_token, rider: existing.rider_name, phone: existing.rider_phone } : null);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (k: string, t: string) => { void copyText(t).then((ok) => { if (ok) { setCopied(k); setTimeout(() => setCopied(null), 1600); } else prompt("Copy this", t); }); };
  const close = () => { setDone(null); setPick(riders[0]?.id ?? "other"); setName(""); setPhone(""); onClose(); };
  if (!order) return null;
  const sendOut = () => start(async () => {
    const r = pick === "other" ? await assignRider(order.id, null, name, phone, eta) : await assignRider(order.id, pick, null, null, eta);
    if ("error" in r) { toast(r.error!, "err"); return; }
    setDone({ track: r.track_token, ride: r.rider_token, rider: r.rider_name, phone: r.rider_phone });
    toast(`Sent out with ${r.rider_name ?? "the rider"}`);
  });
  const chip = (on: boolean) => cn("min-h-11 px-4 rounded-full inline-flex items-center gap-2 text-[14px] font-bold border transition-colors", on ? "bg-[var(--color-green-2)] border-[var(--color-tint)] text-[var(--color-green)]" : "bg-[var(--color-bg-2)] border-[var(--color-separator)]");
  return (
    <Sheet open={!!order} onClose={close} title={done ? "Links to send" : `Send out ${order.display_id ?? order.external_id}`}>
      {!done ? (
        <div className="space-y-4" data-assign-rider>
          <p className="text-sm text-steel">{order.customer_name ?? "The customer"}{order.address ? ` · ${order.address}` : ""}</p>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel mb-2">Who rides it</div>
            <div className="flex flex-wrap gap-2">
              {riders.map((r) => <button key={r.id} type="button" className={chip(pick === r.id)} aria-pressed={pick === r.id} onClick={() => setPick(r.id)} data-rider={r.id}><Bike size={16} aria-hidden />{r.full_name}</button>)}
              <button type="button" className={chip(pick === "other")} aria-pressed={pick === "other"} onClick={() => setPick("other")} data-rider="other"><UserRound size={16} aria-hidden />Someone else</button>
            </div>
            {pick === "other" && <div className="grid grid-cols-2 gap-3 mt-3"><Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kumar" autoFocus /></Field><Field label="Phone" hint="For the WhatsApp link"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="num" inputMode="tel" placeholder="98400 00000" /></Field></div>}
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[.1em] text-steel mb-2">Should reach in</div>
            <div className="flex flex-wrap gap-2">{[15, 25, 35, 45, 60].map((m) => <button key={m} type="button" className={chip(eta === m)} aria-pressed={eta === m} onClick={() => setEta(m)} data-eta={m}><span className="num">{m}</span> min</button>)}</div>
          </div>
          <Button size="lg" className="w-full" disabled={pending || (pick === "other" && !name.trim())} onClick={sendOut} data-send-out-confirm><Bike size={18} /> Send out</Button>
        </div>
      ) : (
        <div className="space-y-4" data-assign-done>
          <div className="rounded-2xl bg-[var(--color-green-2)] text-[var(--color-green)] px-4 py-3 flex items-center gap-2 font-semibold"><Check size={18} /> {done.rider ? `${done.rider} has it` : "Sent out"} — now send the two links.</div>
          <LinkRow label="To the rider" hint="Their page: Picked up · Share my location · Delivered" href={waHref(done.phone, riderText(base, order, done.ride, property))} url={`${base}/ride/${done.ride}`} copied={copied === "ride"} onCopy={() => copy("ride", `${base}/ride/${done.ride}`)} data="rider-link" />
          <LinkRow label="To the customer" hint="Their tracking page: the stage, the rider, the map" href={waHref(order.customer_phone, customerText(base, order, done.rider, property, done.track))} url={`${base}/track/${done.track}`} copied={copied === "track"} onCopy={() => copy("track", `${base}/track/${done.track}`)} data="customer-link" />
          <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setDone(null)}>Change rider</Button><Button className="flex-1" onClick={close}>Done</Button></div>
        </div>
      )}
    </Sheet>
  );
}

function LinkRow({ label, hint, href, url, copied, onCopy, data }: { label: string; hint: string; href: string | null; url: string; copied: boolean; onCopy: () => void; data: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-fill)] p-3.5 space-y-2" data-link-row={data}>
      <div><div className="text-[14px] font-bold">{label}</div><div className="text-[12px] text-steel">{hint}</div></div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        {href ? <a href={href} target="_blank" rel="noreferrer" className="h-11 rounded-full inline-flex items-center justify-center gap-2 bg-[var(--color-green)] text-[var(--color-on-tint)] font-semibold text-sm" data-whatsapp><MessageCircle size={16} /> Send on WhatsApp</a>
          : <span className="h-11 rounded-full inline-flex items-center justify-center text-sm text-steel bg-[var(--color-bg-2)]">No phone — copy the link</span>}
        <button type="button" onClick={onCopy} className="h-11 px-4 rounded-full inline-flex items-center gap-1.5 bg-[var(--color-bg-2)] font-semibold text-sm" aria-label={`Copy the link ${label.toLowerCase()}`}>{copied ? <><Check size={15} className="text-[var(--color-tint)]" /> Copied</> : <><Copy size={15} /> Copy</>}</button>
      </div>
      <div className="text-[11.5px] num text-steel truncate" title={url}>{url.replace(/^https?:\/\//, "")}</div>
    </div>
  );
}
