import { availableDownloads } from "@/lib/installers";

/**
 * Which one-click app files exist right now — the Android APK and the Windows installer — for the install
 * screens (InstallPanel → DownloadFiles). Public, like /get: a new waiter has no account yet. Only addresses
 * and sizes; the files themselves come from the App files bucket (0128), a hosted release or /api/download/<key>.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // 60 s: a file uploaded on Master control → App files is offered within a minute
  return Response.json(await availableDownloads(), { headers: { "cache-control": "public, max-age=60" } });
}
