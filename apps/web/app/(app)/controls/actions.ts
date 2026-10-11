"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Cash in or out of the drawer that is not a sale — through cash_move (0087), which checks the role and insists on a reason. */
export async function cashMove(kind: "in" | "out", amount: number, reason: string, note: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("cash_move", { p_kind: kind, p_amount: amount, p_reason: reason, p_note: note || null });
  if (error) return { error: error.message };
  ["/controls", "/billing", "/audit"].forEach((p) => revalidatePath(p));
  return { ok: true as const, id: data as string };
}
