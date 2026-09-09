import { createClient } from "@/lib/supabase/server";
import { PosClient } from "./PosClient";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const { table } = await searchParams;
  const s = await createClient();
  const [{ data: categories }, { data: items }, { data: tables }, { data: inHouse }] = await Promise.all([
    s.from("categories").select("id, name").order("sort_order"),
    s.from("menu_items").select("id, name, price, is_veg, category_id, is_available").order("name"),
    s.from("dining_tables").select("id, name, status").order("sort_order"),
    s.from("bookings").select("id, booking_no, rooms(number), guests(full_name)").eq("status", "checked_in"),
  ]);
  return <PosClient categories={categories ?? []} items={(items ?? []) as never} tables={tables ?? []} initialTable={table ?? null} inHouse={(inHouse ?? []) as never} />;
}
