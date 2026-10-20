import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The installers this repository has actually built, and where they sit on disk.
 *
 * The Windows installer is ~80 MB. Putting it in `public/` would ride along with every deployment for
 * the rest of the app's life, so it is not there — it is built into `apps/desktop/dist/` and served
 * from disk by whichever machine is running the app. That is exactly the machine a till on the same
 * network can already reach, so nobody has to host anything to get DineFlow onto a second computer.
 * The Android APK (apps/android-app, a Trusted Web Activity — 2026-10-20) is built into
 * `apps/android-app/app/build/outputs/apk/release/` and served the same way.
 *
 * Since 0128 the first answer is the file uploaded on Master control → App files (a public Storage bucket, no
 * deploy needed) — or, since 0129, the link pasted there for a file kept elsewhere (Cloudflare R2: the ~78 MB
 * Windows installer is over Supabase Free's 50 MB upload cap). On a hosted deployment neither disk file is in the bundle, `resolveFile` returns null, and the
 * install screens otherwise fall back to the address of a real release: NEXT_PUBLIC_EXE_URL (or the older
 * NEXT_PUBLIC_DOWNLOAD_WINDOWS) and NEXT_PUBLIC_APK_URL (or NEXT_PUBLIC_DOWNLOAD_ANDROID). A hosted
 * address wins over a file on disk. Both are correct.
 *
 * This lives here rather than beside the route because a Next route file may export only its
 * handlers; anything else fails the build with a type error that reads as if the handler is wrong.
 */

/** The repo root, from this file's position inside apps/web. */
const REPO_ROOT = join(process.cwd(), "..", "..");

type Found = { full: string; as: string; type: string; size: number; version: string | null };

/** The newest DineFlow-Setup-<version>.exe electron-builder left in apps/desktop/dist. */
function windowsFile(): Found | null {
  const dir = join(REPO_ROOT, "apps", "desktop", "dist");
  if (!existsSync(dir)) return null;
  const exes = readdirSync(dir).filter((f) => /^DineFlow-Setup-[\d.]+\.exe$/.test(f))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  if (!exes.length) return null;
  const full = join(dir, exes[0].f);
  return { full, as: exes[0].f, type: "application/vnd.microsoft.portable-executable", size: statSync(full).size, version: exes[0].f.match(/Setup-([\d.]+)\.exe$/)?.[1] ?? null };
}

/** The signed release APK Gradle left in apps/android (versionName read from its build.gradle). */
function androidFile(): Found | null {
  const full = join(REPO_ROOT, "apps", "android-app", "app", "build", "outputs", "apk", "release", "app-release.apk");
  if (!existsSync(full)) return null;
  let version: string | null = null;
  try { version = readFileSync(join(REPO_ROOT, "apps", "android-app", "app", "build.gradle"), "utf8").match(/versionName\s+'([^']+)'/)?.[1] ?? null; } catch { /* the file is enough */ }
  return { full, as: `DineFlow-${version ?? "android"}.apk`, type: "application/vnd.android.package-archive", size: statSync(full).size, version };
}

const FILES: Record<string, () => Found | null> = { windows: windowsFile, android: androidFile };

/** Resolves a known key to a file on disk, or null when this machine has not built it. Nothing here
 *  takes a path from the caller — only a key that must already be in the table above. */
export function resolveFile(key: string) {
  const f = FILES[key];
  return f ? f() : null;
}

export type Download = { url: string; size: number | null; version: string | null; file: string };
export type Downloads = { android: Download | null; windows: Download | null };

type Release = { platform: "android" | "windows"; version: string; file_path: string | null; external_url?: string | null; file_name: string; size_bytes: number | null };
let releases: { at: number; rows: Release[] } | null = null;
/** The files Master control has uploaded (0128 — Master control → App files): the current row per platform, read
 *  as anyone (the install screens are public) and kept for 60 s, so a new upload is offered within a minute. Any
 *  failure — the table not there yet, the network — is "nothing uploaded", never an error on the install screen. */
async function uploaded(): Promise<Release[]> {
  if (releases && Date.now() - releases.at < 60_000) return releases.rows;
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""), key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let rows: Release[] = [];
  if (sb && key) {
    try {
      const r = await fetch(`${sb}/rest/v1/app_releases?select=*&is_current=eq.true`,
        { headers: { apikey: key, authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(4000) });
      if (r.ok) rows = (await r.json()) as Release[];
    } catch { /* offered from env or disk instead */ }
  }
  releases = { at: Date.now(), rows };
  return rows;
}

/** What the install screens offer as a one-click file, first that exists: the file uploaded on Master control →
 *  App files (a public Storage address), else a hosted release whose address is set in env, else the file this
 *  machine built (served by /api/download/<key>), else nothing — the screen then shows the slot as "coming soon". */
export async function availableDownloads(): Promise<Downloads> {
  const sb = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const up = await uploaded();
  const pick = (key: "android" | "windows", hosted: string | undefined, hostedVersion: string | undefined, fallbackName: string): Download | null => {
    const r = up.find((x) => x.platform === key);
    // 0129: a release may be a link (Cloudflare R2 and the like) instead of an upload in the bucket
    if (r?.external_url) return { url: r.external_url, size: Number(r.size_bytes) || null, version: r.version, file: r.file_name };
    if (r?.file_path && sb) return { url: `${sb}/storage/v1/object/public/app-files/${r.file_path.split("/").map(encodeURIComponent).join("/")}`, size: Number(r.size_bytes) || null, version: r.version, file: r.file_name };
    if (hosted) return { url: hosted, size: null, version: hostedVersion || null, file: decodeURIComponent(hosted.split("?")[0].split("/").pop() || fallbackName) };
    const f = resolveFile(key);
    return f ? { url: `/api/download/${key}`, size: f.size, version: f.version, file: f.as } : null;
  };
  return {
    android: pick("android", process.env.NEXT_PUBLIC_APK_URL || process.env.NEXT_PUBLIC_DOWNLOAD_ANDROID, process.env.NEXT_PUBLIC_APK_VERSION, "DineFlow.apk"),
    windows: pick("windows", process.env.NEXT_PUBLIC_EXE_URL || process.env.NEXT_PUBLIC_DOWNLOAD_WINDOWS, process.env.NEXT_PUBLIC_EXE_VERSION, "DineFlow-Setup.exe"),
  };
}
