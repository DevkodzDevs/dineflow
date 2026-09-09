"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addWalkin(name: string, phone: string, party: number) {
  const s = await createClient();
  const { data, error } = await s.rpc("walkin_add", { p_name: name, p_phone: phone, p_party: party });
  if (error) return { error: error.message };
  revalidatePath("/pulse"); return { ok: true as const, ...(data as { id: string; token: string; quoted_min: number | null; position: number }) };
}
export async function setWalkin(id: string, status: "called" | "seated" | "left", tableId?: string) {
  const s = await createClient();
  const { error } = await s.rpc("walkin_set", { p_id: id, p_status: status, p_table: tableId ?? null });
  if (error) return { error: error.message };
  revalidatePath("/pulse"); return { ok: true as const };
}
export async function quote(party: number) {
  const s = await createClient(); const { data } = await s.rpc("quote_wait", { p_party: party }); return data as number | null;
}
