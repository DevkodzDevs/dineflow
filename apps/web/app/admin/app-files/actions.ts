"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

/** After the browser has put the file in the bucket: record it and make it the one handed out (0128). */
export async function publishRelease(input: { platform: "android" | "windows"; version: string; path: string; name: string; size: number; notes: string }) {
  await requireAdmin(); const s = await createClient();
  const { error } = await s.rpc("app_release_publish", { p_platform: input.platform, p_version: input.version, p_path: input.path, p_name: input.name, p_size: input.size, p_notes: input.notes || null });
  if (error) return { error: error.message };
  revalidatePath("/admin/app-files"); return { ok: true as const };
}

/** Hand out an earlier upload again. */
export async function makeCurrent(id: string) {
  await requireAdmin(); const s = await createClient();
  const { error } = await s.rpc("app_release_make_current", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/app-files"); return { ok: true as const };
}
