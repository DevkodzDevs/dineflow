"use client";
import { useEffect } from "react";
/**
 * Registers the service worker for every page, not just the ones behind a login — so the shell is
 * already cached before the first shift, and a reload with no line still opens the app.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const t = setTimeout(() => { void navigator.serviceWorker.register("/sw.js").catch(() => {}); }, 1200);  // after first paint
    return () => clearTimeout(t);
  }, []);
  return null;
}
