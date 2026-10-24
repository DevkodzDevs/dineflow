"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { razorpay } from "@/lib/razorpay";

/** Delivery tracking on or off for the property (0140 restaurants.delivery_tracking). Off: the rider's position is never
 *  shown to a customer and the Send out button leaves Online orders. The row is the owner's and a manager's to write (RLS). */
export async function setTracking(on: boolean) {
  const s = await createClient();
  const { data: me } = await s.rpc("session_bundle");
  const rid = (me as { restaurant?: { id?: string } } | null)?.restaurant?.id;
  if (!rid) return { error: "sign in first" };
  const { error, count } = await s.from("restaurants").update({ delivery_tracking: on }, { count: "exact" }).eq("id", rid);
  if (error) return { error: error.message };
  if (!count) return { error: "Only the owner or a manager can change this." };
  ["/connections", "/online-orders"].forEach((p) => revalidatePath(p));
  return { ok: true as const };
}

/** Do the saved Razorpay keys work? One read of the account's payments (count 1) with the saved key and secret — the row
 *  is the owner's alone (RLS), so a manager gets "only the owner". Nothing is charged and nothing is stored. */
export async function testGateway() {
  const s = await createClient();
  const { data: gw, error } = await s.from("payment_gateways").select("key_id, key_secret").maybeSingle();
  if (error) return { error: error.message };
  if (!gw) return { error: "No Razorpay keys saved yet — or only the owner can read them." };
  if (!gw.key_secret) return { error: "The key secret is not saved. Paste it and save, then test again." };
  try {
    await razorpay<{ count: number }>({ key_id: gw.key_id, key_secret: gw.key_secret }, "/payments?count=1");
    return { ok: true as const, message: `Keys work — Razorpay answered for ${gw.key_id.startsWith("rzp_live") ? "the live account" : gw.key_id.startsWith("rzp_test") ? "a test account" : "the account"}.` };
  } catch (e) { return { error: `Razorpay refused the keys: ${(e as Error).message}` }; }
}
