"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function redeemKey(fd: FormData) {
  const s = await createClient();
  const { data, error } = await s.rpc("redeem_membership", { p_code: String(fd.get("code")).trim().toUpperCase() });
  if (error) return { error: error.message };
  revalidatePath("/", "layout"); return { ok: true, plan: data as string };
}
