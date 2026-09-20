"use client";
import { useEffect } from "react";

/**
 * Drop every cached page the moment someone is standing at the sign-in screen.
 *
 * The service worker caches page HTML so a till keeps working when the line drops, which is right —
 * but those pages carry a property's orders, guests and takings, and they outlived the session that
 * fetched them. On a shared terminal the next person to sign in could pull yesterday's shift out of
 * the cache simply by losing signal. Being on this screen means there is no session to protect, so
 * this is the moment to clear them.
 *
 * What it does NOT touch: the build output and fonts (hashed, impersonal, and what makes the app
 * load at all offline), and nothing in IndexedDB — the outbox there may still be holding writes that
 * have not reached the server, and those belong to the property, not to the session.
 */
const KEEP = /^\/(_next|fonts)\//;
const KEEP_EXACT = new Set(["/offline", "/manifest.json", "/sw.js"]);
const KEEP_EXT = /\.(png|jpe?g|svg|ico|webmanifest|woff2?|ttf)$/i;

export function SignedOutCleanup() {
  useEffect(() => {
    if (typeof caches === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        for (const key of await caches.keys()) {
          if (cancelled) return;
          const cache = await caches.open(key);
          for (const req of await cache.keys()) {
            const path = new URL(req.url).pathname;
            if (KEEP.test(path) || KEEP_EXACT.has(path) || KEEP_EXT.test(path)) continue;
            await cache.delete(req);
          }
        }
      } catch { /* private mode, or the browser is refusing storage — nothing to clean either way */ }
    })();
    return () => { cancelled = true; };
  }, []);
  return null;
}
