"use server";
import { createClient } from "@supabase/supabase-js";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export async function discover(q: string, city: string, mode: string) {
  const { data, error } = await anon().rpc("dine_discover", { p_q: q || null, p_city: city || null, p_lat: null, p_lng: null, p_mode: mode || null });
  if (error) return { error: error.message }; return { ok: true, list: data as never[] };
}
export async function slots(slug: string, date: string, party: number) {
  const { data, error } = await anon().rpc("dine_slots", { p_slug: slug, p_date: date, p_party: party });
  if (error) return { error: error.message }; return { ok: true, slots: data as never[] };
}
export async function reserve(slug: string, guest: { full_name: string; phone: string; email?: string }, date: string, time: string, party: number, occasion: string, note: string, offer: string | null) {
  const { data, error } = await anon().rpc("dine_reserve", { p_slug: slug, p_guest: guest, p_date: date, p_time: time, p_party: party, p_occasion: occasion || null, p_note: note || null, p_offer: offer });
  if (error) return { error: error.message }; return { ok: true, booking: data as never };
}
export async function placeOrder(slug: string, guest: { full_name: string; phone: string; address?: string }, items: { id: string; qty: number; note?: string }[], mode: string, note: string, offer: string | null) {
  const { data, error } = await anon().rpc("dine_order", { p_slug: slug, p_guest: guest, p_items: items, p_mode: mode, p_note: note || null, p_offer: offer });
  if (error) return { error: error.message }; return { ok: true, order: data as never };
}
export async function track(ref: string, phone: string) {
  const { data, error } = await anon().rpc("dine_track", { p_ref: ref, p_phone: phone });
  if (error) return { error: error.message }; return { ok: true, result: data as never };
}
export async function review(slug: string, guest: string, rating: number, body: string, ref: string) {
  const { error } = await anon().rpc("dine_review", { p_slug: slug, p_guest: guest, p_rating: rating, p_body: body, p_ref: ref || null });
  if (error) return { error: error.message }; return { ok: true };
}
