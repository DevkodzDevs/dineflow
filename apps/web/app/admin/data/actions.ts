"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

/** Save Master control → Data's settings (0172 data_settings_set). A secret is replaced only by a new one; a blank box
 *  leaves it; clear_* removes it. The answer never holds a secret — only "set" and its last four. */
export async function saveDataSettings(p: Record<string, unknown>) {
  await requireAdmin(); const s = await createClient();
  const { data, error } = await s.rpc("data_settings_set", { p });
  if (error) return { error: error.message };
  revalidatePath("/admin/data");
  return { ok: true as const, settings: data };
}
