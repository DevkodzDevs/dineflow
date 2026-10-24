"use server";
import { createClient } from "@supabase/supabase-js";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/** The customer's page (0140 delivery_track): where the order stands, who brings it, where they are — by the link's token. */
export type Track = {
  status: "placed" | "cooking" | "ready" | "on_the_way" | "delivered" | "cancelled"; mode: string | null; ref: string | null; items: { name: string; qty: number }[]; total: number | null; eta_min: number | null;
  property: { name: string; phone: string | null }; rider: { name: string | null; phone: string | null } | null; position: { lat: number; lng: number; at: string } | null;
  timeline: { placed: string | null; picked_up: string | null; delivered: string | null };
};
export async function trackOrder(token: string) {
  const { data, error } = await anon().rpc("delivery_track", { p_token: token });
  if (error) return { error: error.message }; return { ok: true as const, track: (data ?? null) as Track | null };
}

/** The rider's page (delivery_rider_view / delivery_rider_set): the drop, and Picked up / a position / Delivered — by the rider's own token. */
export type Ride = {
  status: "assigned" | "picked_up" | "delivered" | "cancelled"; ref: string | null; items: { name: string; qty: number }[]; total: number | null; prepaid: boolean;
  customer: { name: string | null; phone: string | null; address: string | null }; property: { name: string; phone: string | null }; rider: string | null; eta_min: number | null;
  located_at: string | null; picked_up_at: string | null; delivered_at: string | null;
};
export async function riderView(token: string) {
  const { data, error } = await anon().rpc("delivery_rider_view", { p_rider_token: token });
  if (error) return { error: error.message }; return { ok: true as const, ride: (data ?? null) as Ride | null };
}
export async function riderSet(token: string, status: "picked_up" | "delivered" | null, lat: number | null, lng: number | null) {
  const { data, error } = await anon().rpc("delivery_rider_set", { p_rider_token: token, p_status: status, p_lat: lat, p_lng: lng });
  if (error) return { error: error.message }; return { ok: true as const, state: (data ?? null) as { status: string; located_at: string | null; picked_up_at: string | null; delivered_at: string | null } | null };
}
