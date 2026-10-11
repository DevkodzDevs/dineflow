/**
 * Copy and share that never throw. `navigator.clipboard` is refused in more places than it works —
 * an iframe, an http page, a browser that asks and is told no — and a refused write used to surface as
 * an uncaught error while the button still said "Copied". `navigator.share` throws when the person
 * closes the share sheet. These return what happened instead.
 */
export async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch { /* refused — fall back below */ }
  try {
    const t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok;
  } catch { return false; }
}

/** "shared", "cancelled" (the sheet was closed — not an error), or "unavailable" (no share here; copy instead). */
export async function shareText(data: ShareData): Promise<"shared" | "cancelled" | "unavailable"> {
  if (typeof navigator === "undefined" || !navigator.share) return "unavailable";
  try { await navigator.share(data); return "shared"; }
  catch (e) { return (e as Error)?.name === "AbortError" ? "cancelled" : "unavailable"; }
}
