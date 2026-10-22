import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { AppFilesClient, type Release } from "./AppFilesClient";
export const metadata = { title: "App files · Master control" };
export const dynamic = "force-dynamic";

/**
 * The one-click app files every install screen offers — the Android .apk and the Windows .exe (0128, 2026-10-20 — the
 * owner: "simple and easy options to update"). Drop the new file on its card and Upload: the browser sends it straight
 * to the public `app-files` bucket (a Vercel function would refuse a 78 MB body), then `app_release_publish` makes it
 * the one handed out. The install screens read the current row within a minute — no env var, no deploy.
 */
export default async function AppFilesPage() {
  await requireAdmin(); const s = await createClient();
  const { data, error } = await s.from("app_releases")
    .select("*").order("created_at", { ascending: false }).limit(40);
  const base = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/app-files/`;
  // an upload is served from the bucket; a link (0129) is handed out as it is
  const rows = ((data ?? []) as Omit<Release, "url">[]).map((r) => ({ ...r, url: r.external_url || base + (r.file_path ?? "").split("/").map(encodeURIComponent).join("/") }));
  return (
    <div>
      <div className="eyebrow">Platform</div>
      <h1 className="text-[34px] md:text-[48px] mt-1">App <em>files</em></h1>
      <p className="text-sm text-[var(--color-label-2)] mt-2 max-w-2xl">The Android and Windows apps staff install. Drop a file on its card and press Upload — live in a minute.</p>
      <AppFilesClient rows={rows} ready={!error} />
    </div>
  );
}
