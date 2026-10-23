/**
 * Run something once the screen the person opened has finished loading and the browser is idle, then `after` ms more
 * (2026-10-23, the owner: "the first load is too slow"). Measured on the live site: on a first visit the Assist insights,
 * the download list, the support count and the screen warm-up all left during the load and queued on the same server and
 * database as the screen itself. Work that is not the screen waits here. Returns a cancel.
 */
export function whenSettled(fn: () => void, after = 0): () => void {
  if (typeof window === "undefined") return () => {};
  let off = false, timer: ReturnType<typeof setTimeout> | null = null, idleId: number | null = null;
  const ric = window.requestIdleCallback?.bind(window) ?? ((cb: () => void) => window.setTimeout(cb, 200));
  const cic = window.cancelIdleCallback?.bind(window) ?? window.clearTimeout.bind(window);
  const go = () => { if (off) return; idleId = ric(() => { if (!off) timer = setTimeout(() => { if (!off) fn(); }, after); }, { timeout: 3000 }); };
  if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
  return () => { off = true; window.removeEventListener("load", go); if (timer) clearTimeout(timer); if (idleId !== null) cic(idleId); };
}
