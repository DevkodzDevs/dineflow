"use client";
import { useEffect } from "react";
import { getClient } from "@/lib/supabase/lazy";
import { whenSettled } from "@/lib/idle";

/**
 * Nobody took it → a free cleaner gets it (0158, the owner: "after 5 minutes, if nobody assigned the table or room, give it
 * to a cleaner who is free, at random"). The database has no timer of its own (no pg_cron), so every signed-in device of the
 * property asks `clean_auto_assign()` once a minute while it is in view; the function hands out whatever has waited past
 * the property's minutes (restaurants.clean_auto_minutes, 0 = off), locks each job so two devices never give one out twice,
 * and does nothing at all when nothing is waiting. The person it lands on hears "Given to you" (Notifier, kind `assigned`).
 * Mounted only where the property cleans tables or has rooms. Renders nothing.
 */
export function AutoAssign() {
  useEffect(() => {
    let alive = true; let iv: ReturnType<typeof setInterval> | null = null;
    const ask = () => { if (document.visibilityState !== "visible") return; void getClient().then((c) => (alive ? c.rpc("clean_auto_assign") : null)).catch(() => {}); };
    const cancel = whenSettled(() => { ask(); iv = setInterval(ask, 60000); }, 4000);
    return () => { alive = false; cancel(); if (iv) clearInterval(iv); };
  }, []);
  return null;
}
