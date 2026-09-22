"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ok = () => { revalidatePath("/customers"); return { ok: true as const }; };

/** A customer by phone: created on first sight, otherwise updated. Tags arrive comma-separated. */
export async function saveCustomer(fd: FormData) {
  const s = await createClient();
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const date = (k: string) => (str(k) ? str(k) : null);
  const tags = [...new Set(str("tags").split(/[,\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  const { data, error } = await s.rpc("customer_upsert", {
    p_phone: str("phone"), p_name: str("name") || null, p_email: str("email") || null,
    p_birthday: date("birthday"), p_anniversary: date("anniversary"), p_tags: tags, p_notes: str("notes") || null,
  });
  if (error) return { error: error.message };
  return { ...ok(), id: data as string };
}

/** Points given or taken by hand, with a reason. Returns the new balance. */
export async function adjustPoints(customerId: string, points: number, note: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("loyalty_adjust", { p_customer_id: customerId, p_points: points, p_note: note || null });
  if (error) return { error: error.message };
  return { ...ok(), balance: Number(data) };
}

export type HistoryRow = { id: string; bill_no: number; total: number; paid_at: string | null; points_earned: number; points_redeemed: number; coupon_code: string | null;
  orders: { order_no: number; type: string; order_items: { name_snapshot: string; qty: number; status: string }[] } | null };
/** What this guest has had with us: paid bills, newest first, with the dishes on each. */
export async function customerHistory(customerId: string) {
  const s = await createClient();
  const [{ data: bills, error }, { data: ledger }] = await Promise.all([
    s.from("bills").select("id, bill_no, total, paid_at, points_earned, points_redeemed, coupon_code, orders(order_no, type, order_items(name_snapshot, qty, status))")
      .eq("customer_id", customerId).eq("status", "paid").order("paid_at", { ascending: false }).limit(50),
    s.from("loyalty_ledger").select("points, kind, note, created_at").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(30),
  ]);
  if (error) return { error: error.message };
  return { ok: true as const, bills: (bills ?? []) as unknown as HistoryRow[], ledger: (ledger ?? []) as { points: number; kind: string; note: string | null; created_at: string }[] };
}
