"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function createInvite(role: string) {
  const s = await createClient(); const { data, error } = await s.rpc("create_invite", { p_role: role });
  if (error) return { error: error.message }; revalidatePath("/staff"); return { ok: true, code: data as string };
}

/** Role, sections and active flag for one person — through owner_set_access, which enforces who may change whom. */
export async function setAccess(userId: string, role: string, modules: string[] | null, active: boolean) {
  const s = await createClient();
  const { error } = await s.rpc("owner_set_access", { p_user: userId, p_role: role, p_modules: modules, p_active: active });
  if (error) return { error: error.message };
  revalidatePath("/staff"); return { ok: true as const };
}
