import { aiEnabled } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { holdDue } from "@/lib/holdDue";
import { requireSession } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { withOptions } from "@/lib/menuOptions";
import { optionReads, optionsFor } from "@/lib/scoped";
import { PosClient } from "./PosClient";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string; type?: string; add?: string }> }) {
  const { table, type, add } = await searchParams;
  const s = await createClient(); const held = holdDue(s);   // a booking due now holds its table or room (0154)
  // the session travels with the page's own rows, not in front of them: one trip, not two
  const [session, { data: categories }, { data: items }, { data: tables }, { data: inHouse }, { data: stock }, { data: running }, v0, g0, l0, c0, { data: pairings }, { data: sold }, { data: booked }, { data: cleans }, { data: addRow }] = await Promise.all([
    requireSession(),
    s.from("categories").select("id, name").order("sort_order"),
    s.from("menu_items").select("id, name, price, is_veg, category_id, is_available, is_combo, image_url, station, prep_minutes, categories(station)").order("name"),
    s.from("dining_tables").select("id, name, status").order("sort_order"),
    s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
    // how many portions of each dish the pantry can still cover, so the till can say so before a
    // waiter promises it to a table rather than after the kitchen has picked the ticket up
    s.rpc("menu_stock"),
    // the orders already running on a table, so tapping an occupied one can offer the open ticket
    // open tickets for the top strip: the tables', and (2026-10-24) the parcels' — a parcel shows parcels, never tables
    s.from("orders").select("id, order_no, table_id, type, token_no, customer_name, created_at, order_items(qty, status), dining_tables(name), bills(status)").eq("status", "open").in("type", ["dine_in", "takeaway", "delivery"]).order("created_at", { ascending: false }).limit(60),
    // sizes, add-on groups and combo parts: what a dish asks before it goes on a ticket
    ...optionReads(s),
    // what this property's guests order together, for "Goes well with" at the till (0080)
    s.rpc("menu_pairings"),
    // what sells most here, for the till's Popular chip: plates in the last 30 days
    s.from("order_items").select("menu_item_id, qty").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).neq("status", "cancelled").not("menu_item_id", "is", null).limit(5000),
    // today's bookings that hold a table, and the tables still being cleaned: with the open orders, what is not free
    s.from("reservations").select("table_id, at_time").eq("on_date", todayIST()).in("status", ["requested", "confirmed"]).not("table_id", "is", null),
    s.from("table_cleanings").select("table_id").in("status", ["pending", "in_progress"]),
    // *Add items* on an open order (0165): the order the new dishes join, as a new kitchen ticket on it
    add && /^[0-9a-f-]{36}$/i.test(add) ? s.from("orders").select("id, order_no, table_id, type, status, bills(status)").eq("id", add).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  // it joins while it is open and no bill is printed on it (0145's rule for QR rounds); otherwise the till sends a separate order
  const ar = addRow as { id: string; order_no: number; table_id: string | null; type: string; status: string; bills: { status: string }[] | null } | null;
  const addTo = ar && ar.status === "open" && !(ar.bills ?? []).some((b) => b.status === "unpaid" || b.status === "paid")
    ? { id: ar.id, order_no: ar.order_no, table_id: ar.table_id, type: ar.type as "dine_in" | "takeaway" | "delivery" | "room_service" } : null;
  // the master reads every property's options (lib/scoped.ts): only for it, ask again for this property
  const [{ data: variants }, { data: groups }, { data: links }, { data: combos }] = await optionsFor(s, session, [v0, g0, l0, c0] as const);
  // A new order picks from the free tables only (2026-10-20, the owner): not one with an open order or marked occupied,
  // not one held — marked reserved, or a booking due from 30 min ago to 2 h from now (IST) — and not one being cleaned.
  const ist = new Date(Date.now() + 5.5 * 3600000); const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const minsOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
  const notFree: Record<string, "occupied" | "reserved" | "cleaning"> = {};
  for (const c of (cleans ?? []) as { table_id: string }[]) notFree[c.table_id] = "cleaning";
  for (const b of (booked ?? []) as { table_id: string; at_time: string }[]) { const m = minsOf(b.at_time); if (m >= nowMin - 30 && m <= nowMin + 120) notFree[b.table_id] = "reserved"; }
  for (const t of (tables ?? []) as { id: string; status: string }[]) if (t.status === "reserved") notFree[t.id] = "reserved";
  for (const t of (tables ?? []) as { id: string; status: string }[]) if (t.status === "occupied") notFree[t.id] = "occupied";
  for (const o of (running ?? []) as { table_id: string | null }[]) if (o.table_id) notFree[o.table_id] = "occupied";
  const popular: Record<string, number> = {};
  for (const r of (sold ?? []) as { menu_item_id: string; qty: number }[]) popular[r.menu_item_id] = (popular[r.menu_item_id] ?? 0) + Number(r.qty);
  const pairs: Record<string, { id: string; n: number }[]> = {};
  for (const p of (pairings ?? []) as { item: string; pair: string; together: number }[]) (pairs[p.item] ??= []).push({ id: p.pair, n: p.together });
  const menu = withOptions(items ?? [], (variants ?? []) as never, (groups ?? []) as never, links ?? [], combos ?? []);
  // 0166 (the owner): a table takes one open order and none while it is being cleaned. Opened on a table whose order is
  // still open with no bill, the till adds to that order; opened on a table being cleaned, it starts with no table chosen.
  type Run = { id: string; order_no: number; table_id: string | null; type: string; bills: { status: string }[] | null };
  const busyOn = !addTo && table ? ((running ?? []) as Run[]).find((o) => o.table_id === table) : undefined;
  const into = addTo ?? (busyOn && !(busyOn.bills ?? []).some((b) => b.status === "unpaid" || b.status === "paid")
    ? { id: busyOn.id, order_no: busyOn.order_no, table_id: busyOn.table_id, type: busyOn.type as "dine_in" | "takeaway" | "delivery" | "room_service" } : null);
  const first = table && notFree[table] === "cleaning" ? null : table || into?.table_id || null;
  await held;
  return <PosClient stockBlock={(session.restaurant as { stock_block?: boolean }).stock_block !== false} categories={categories ?? []} items={menu as never} tables={tables ?? []} initialTable={first} addTo={into} initialType={type === "takeaway" || type === "delivery" ? type : null}
    inHouse={(inHouse ?? []) as never} stock={(stock ?? {}) as never} running={(running ?? []) as never} ai={aiEnabled()}
    promise={session.restaurant.promise_enabled ? { minutes: Number(session.restaurant.promise_minutes ?? 30), pct: Number(session.restaurant.promise_pct ?? 0) } : null} pairs={pairs} popular={popular} notFree={notFree} />;
}
