"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => revalidatePath("/admin", "layout");
export async function issueKey(plan: "monthly" | "yearly", restaurantId: string | null) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_issue_key", { p_plan: plan, p_days: plan === "yearly" ? 365 : 30, p_restaurant_id: restaurantId });
  if (error) return { error: error.message }; bump(); return { ok: true, code: data as string };
}
export async function setMembership(restaurantId: string, status: "trial" | "active" | "expired" | "suspended", days: number | null) {
  const s = await createClient();
  const { error } = await s.rpc("admin_set_membership", { p_restaurant_id: restaurantId, p_status: status, p_days: days });
  if (error) return { error: error.message }; bump(); return { ok: true };
}

export async function actAs(restaurantId: string) {
  const s = await createClient(); const { error } = await s.rpc("admin_act_as", { p_restaurant: restaurantId });
  if (error) return { error: error.message }; revalidatePath("/", "layout"); return { ok: true };
}
export async function stopActing() { const s = await createClient(); await s.rpc("admin_stop_acting"); revalidatePath("/", "layout"); return { ok: true }; }
export async function setMasterPassword(pw: string) {
  const s = await createClient(); const { error } = await s.rpc("master_set_password", { p_new: pw });
  if (error) return { error: error.message }; return { ok: true };
}

/** Master control can create a property itself — no public sign-up needed. */
export async function createProperty(name: string, type: "restaurant" | "hotel" | "resort", demo: boolean) {
  const s = await createClient();
  const { data, error } = await s.rpc("admin_create_property", { p_name: name, p_type: type, p_demo: demo });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as { id: string; slug: string }) };
}

/** Six ready-made properties with their own owner logins, 60 days of history, one district. */
export async function installEstate() {
  const s = await createClient();
  const { data, error } = await s.rpc("install_sample_estate");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true, ...(data as { properties: { name: string; type: string; email: string; password: string }[] }) };
}

/** Master only: which modules this property's people can open. NULL = everything the type allows. */
export async function setModules(restaurantId: string, modules: string[] | null) {
  const s = await createClient();
  const { error } = await s.rpc("master_set_modules", { p_restaurant_id: restaurantId, p_modules: modules });
  if (error) return { error: error.message };
  revalidatePath("/admin"); return { ok: true as const };
}
