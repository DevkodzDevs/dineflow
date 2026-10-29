import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A booking holds its table or room when its time comes (0154, rooms-and-reservations.md): the screens that show tables
 * and rooms start this with their own reads and wait for it before they answer, so it costs no extra round trip. It
 * never fails a screen — a hold missed now is made on the next draw (they refresh every 30–60 s).
 */
export function holdDue(s: SupabaseClient): Promise<void> {
  return Promise.resolve(s.rpc("hold_due")).then(() => undefined, () => undefined);
}
