"use client";
import { getClient } from "@/lib/supabase/lazy";

/** A screenshot shrunk in the browser to a JPEG no wider or taller than 1600px — a phone photo of a
 *  screen is 3–6 MB, which is slow on a counter's Wi-Fi and over the bucket's 3 MB limit. */
export async function shrinkShot(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.82));
}

/** Up to three pictures into the request's own folder (<property>/<request>/…). Storage's rules allow
 *  it only for a request the person can see; the paths that made it go back to support_attach. */
export async function uploadShots(restaurantId: string, ticketId: string, files: File[]): Promise<{ paths: string[]; failed: number }> {
  const sb = await getClient(); const paths: string[] = []; let failed = 0;
  for (const [i, f] of files.slice(0, 3).entries()) {
    const blob = await shrinkShot(f);
    const path = `${restaurantId}/${ticketId}/${Date.now()}-${i + 1}.jpg`;
    const { error } = await sb.storage.from("support").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) failed++; else paths.push(path);
  }
  return { paths, failed };
}

/** What the app knows about where the person is, sent with a request so support need not ask. */
export function whereAmI(from: string | null): Record<string, string | number | boolean | null> {
  const ua = navigator.userAgent;
  const device = /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1 ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android phone" : "Android tablet") : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Other";
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const app = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone ? "installed app" : "browser";
  return {
    page: from && from.startsWith("/") && !from.startsWith("//") ? from.slice(0, 200) : null,
    device: `${device} · ${browser} · ${app}`,
    screen: `${innerWidth}×${innerHeight}`,
    theme: document.documentElement.getAttribute("data-theme"),
    online: navigator.onLine,
    language: navigator.language,
    version: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
}
