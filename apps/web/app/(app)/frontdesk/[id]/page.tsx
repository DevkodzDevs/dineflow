import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth";
import { phone10 } from "@/lib/phone";
import { FolioClient } from "./FolioClient";
import { EXTRA_PRESETS, DISCOUNT_PRESETS, type Preset } from "./charges";
export const dynamic = "force-dynamic";

type Open = { id: string; order_no: number; booking_id: string | null; type: string; customer_name: string | null; customer_phone: string | null; created_at: string; table: { name: string } | null; order_items: { qty: number; price_snapshot: number; status: string }[] };

export default async function FolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = await createClient();
  const { data: b } = await s.from("bookings").select("*, guests(*), rooms(number, floor, room_types(name))").eq("id", id).maybeSingle();
  if (!b) notFound();
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: charges }, { data: totals }, { data: orders }, { data: past }] = await Promise.all([
    requireSession(),
    s.from("booking_charges").select("*").eq("booking_id", id).order("created_at"),
    s.rpc("folio_totals", { p_booking_id: id }),
    s.from("orders").select("id, order_no, booking_id, type, customer_name, customer_phone, created_at, table:table_id(name), order_items(qty, price_snapshot, status)")
      .eq("restaurant_id", b.restaurant_id).eq("status", "open").order("created_at", { ascending: false }).limit(60),
    // what this property has put on folios before — the charge picker offers them first, with what they cost last time
    s.from("booking_charges").select("kind, description, amount").eq("restaurant_id", b.restaurant_id).in("kind", ["extra", "discount"]).order("created_at", { ascending: false }).limit(400),
  ]);

  /* 2026-11-04, the owner: "Charge a restaurant order shows for every new customer". It listed every open order in the
     property. Now: this stay's orders — room service from the room's QR (0170, booking_id), a till room-service ticket for this
     room ("Room 305 · name"), or an order with the guest's phone — and every other open order only behind "Another order". */
  const room = b.rooms?.number ? `Room ${b.rooms.number} ·` : null;
  const gp = phone10(b.guests?.phone);
  const all = (orders ?? []) as unknown as Open[];
  const isMine = (o: Open) => o.booking_id === id || (!!room && o.type === "room_service" && (o.customer_name ?? "").startsWith(room)) || (gp.length === 10 && phone10(o.customer_phone) === gp);
    // another room's room-service ticket is never offered here
  const mine = all.filter(isMine), others = all.filter((o) => !isMine(o) && !o.booking_id && !(o.type === "room_service" && /^Room \S+ ·/.test(o.customer_name ?? "")));

  // the picker: used here first (newest amount), then the usual ones not used yet; nothing the system writes itself
  const presetsFor = (kind: "extra" | "discount", usual: string[]): Preset[] => {
    const seen = new Map<string, Preset>();
    for (const c of (past ?? []) as { kind: string; description: string; amount: number }[]) {
      const name = c.description?.trim(); if (!name || c.kind !== kind || /#\d|^Advance|^Payment|^GST on/i.test(name)) continue;
      const k = name.toLowerCase(); if (!seen.has(k)) seen.set(k, { name, amount: Math.abs(Number(c.amount)) || null, used: true });
    }
    const used = [...seen.values()].slice(0, 12);
    return [...used, ...usual.filter((u) => !seen.has(u.toLowerCase())).map((name) => ({ name, amount: null, used: false }))];
  };

  // the check-in link goes to a guest, so it needs a whole address — same source as Pulse's queue link
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_CLOUD_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;
  return <FolioClient booking={b as never} charges={charges ?? []} totals={(totals as never[])?.[0] as never} openOrders={mine as never} otherOrders={others as never}
    presets={{ extra: presetsFor("extra", EXTRA_PRESETS), discount: presetsFor("discount", DISCOUNT_PRESETS) }} restaurant={session.restaurant} base={base} />;
}
