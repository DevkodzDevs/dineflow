import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The installers this repository has actually built, and where they sit on disk.
 *
 * The Windows installer is 79 MB. Putting it in `public/` would ride along with every deployment for
 * the rest of the app's life, so it is not there — it is built into `apps/desktop/dist/` and served
 * from disk by whichever machine is running the app. That is exactly the machine a till on the same
 * network can already reach, so nobody has to host anything to get DineFlow onto a second computer.
 *
 * On a hosted deployment the file is not in the bundle, `resolveFile` returns null, and the /get page
 * falls back to NEXT_PUBLIC_DOWNLOAD_WINDOWS — the address of a real release. Both are correct.
 *
 * This lives here rather than beside the route because a Next route file may export only its
 * handlers; anything else fails the build with a type error that reads as if the handler is wrong.
 */
const FILES: Record<string, { path: string[]; type: string; as: string }> = {
  windows: {
    path: ["apps", "desktop", "dist", "DineFlow-Setup-1.0.0.exe"],
    type: "application/vnd.microsoft.portable-executable",
    as: "DineFlow-Setup-1.0.0.exe",
  },
};

/** The repo root, from this file's position inside apps/web. */
const REPO_ROOT = join(process.cwd(), "..", "..");

/** Resolves a known key to a file on disk, or null when this machine has not built it. Nothing here
 *  takes a path from the caller — only a key that must already be in the table above. */
export function resolveFile(key: string) {
  const f = FILES[key];
  if (!f) return null;
  const full = join(REPO_ROOT, ...f.path);
  if (!existsSync(full)) return null;
  return { ...f, full, size: statSync(full).size };
}
