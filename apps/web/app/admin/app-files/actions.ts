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

/** Hand out a file kept elsewhere by its public https link (0129) — the ~78 MB Windows installer on Cloudflare R2, which
 *  Supabase Free will not take (50 MB a file). The function checks Master control, https and the extension itself. */
export async function publishLink(input: { platform: "android" | "windows"; version: string; url: string; sizeMb: number | null; notes: string }) {
  await requireAdmin(); const s = await createClient();
  const size = input.sizeMb && input.sizeMb > 0 ? Math.round(input.sizeMb * 1048576) : null;
  const { error } = await s.rpc("app_release_publish_link", { p_platform: input.platform, p_version: input.version, p_url: input.url.trim(), p_file_name: null, p_size_bytes: size, p_notes: input.notes || null });
  if (error) return { error: /app_release_publish_link|function .* does not exist|schema cache/i.test(error.message) ? "Publishing by link is not set up yet — migration 0129 has to be applied first." : error.message };
  revalidatePath("/admin/app-files"); return { ok: true as const };
}
