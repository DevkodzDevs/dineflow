"use client";
import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

/**
 * The path the menu should light: the page you are on — or, from the moment a link to another page of the app is
 * clicked until that page arrives, the page you asked for (2026-10-20, the owner's "options open slowly"). The
 * screen itself still takes its 200–500 ms on a phone; the menu answers the tap at once instead of keeping the old
 * section lit for that whole wait. Cleared when the pathname changes, and after 4 s in case the navigation never
 * lands (an error page, a redirect elsewhere).
 */
let wanted: string | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();
const set = (p: string | null) => { if (p === wanted) return; wanted = p; clearTimeout(timer); if (p) timer = setTimeout(() => set(null), 4000); subs.forEach((f) => f()); };
let listening = false;
const listen = () => {
  if (listening || typeof document === "undefined") return; listening = true;
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname === location.pathname || u.pathname.startsWith("/api")) return;
    set(u.pathname);
  }, true);
};

export function useNavPath(): string {
  const path = usePathname();
  const w = useSyncExternalStore((f) => { listen(); subs.add(f); return () => { subs.delete(f); }; }, () => wanted, () => null);
  useEffect(() => { set(null); }, [path]);   // arrived (or went somewhere else): follow the real page again
  return w ?? path;
}
