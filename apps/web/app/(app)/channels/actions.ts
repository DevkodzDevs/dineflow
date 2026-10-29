"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wrote } from "@/lib/wrote";
const bump = () => ["/channels", "/frontdesk", "/rooms"].forEach((p) => revalidatePath(p));
/** The partner API key is write-only from this screen: it is never sent to the browser, so a blank
 *  field on an edit means "keep the saved one" (it used to erase it on every save). */
const keyOf = (fd: FormData, id: string | null): { api_key?: string | null } => {
  const k = String(fd.get("api_key") ?? "").trim();
  return k || !id ? { api_key: k || null } : {};
};
export async function saveOta(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { kind: String(fd.get("kind")), label: String(fd.get("label")), mode: String(fd.get("mode")), room_type_id: (fd.get("room_type_id") as string) || null, import_url: (fd.get("import_url") as string) || null, api_base: (fd.get("api_base") as string) || null, ...keyOf(fd, id), hotel_ref: (fd.get("hotel_ref") as string) || null, commission_pct: Number(fd.get("commission_pct") || 15), rate_offset_pct: Number(fd.get("rate_offset_pct") || 0), is_live: fd.get("is_live") === "on" };
  const { data, error } = await (id ? s.from("ota_channels").update(row).eq("id", id).select("id").single() : s.from("ota_channels").insert(row).select("id").single());
  // the id comes back so the screen can sync the pasted calendar at once (2026-10-29)
  if (error) return { error: error.message }; bump(); return { ok: true as const, id: (data as { id: string } | null)?.id ?? id };
}
export async function deleteOta(id: string) {
  const s = await createClient(); const bad = wrote(await s.from("ota_channels").delete().eq("id", id).select("id"), "That channel could not be removed.");
  if (bad) return bad; bump(); return { ok: true };
}
export async function setRates(roomTypeId: string, from: string, to: string, rate: number | null, open: number | null, stop: boolean, min: number | null) {
  const s = await createClient(); const { error } = await s.rpc("set_rate_inventory", { p_room_type_id: roomTypeId, p_from: from, p_to: to, p_rate: rate, p_open: open, p_stop: stop, p_min: min });
  if (error) return { error: error.message }; bump(); return { ok: true };
}

/** Sets a rate per night and nothing else — "Use suggested rates" (0082). Stop-sell and minimum stay stay as they were. */
export async function setRatesOnly(roomTypeId: string, nights: { date: string; rate: number }[]) {
  if (!nights.length) return { ok: true as const, n: 0 };
  const s = await createClient(); const { data, error } = await s.rpc("set_rates_only", { p_room_type_id: roomTypeId, p_dates: nights.map((x) => x.date), p_rates: nights.map((x) => Math.round(x.rate)) });
  if (error) return { error: error.message }; bump(); return { ok: true as const, n: Number(data) };
}

/** Push menu (delivery) or rates+availability (OTA). Simulates and logs when no partner key is set. */
export async function pushChannel(id: string, kind: "menu" | "ari") {
  const s = await createClient(); const { data, error } = await s.rpc("push_channel", { p_channel_id: id, p_kind: kind });
  if (error) return { error: error.message }; bump(); return { ok: true, ...(data as { live: boolean; count: number; message: string }) };
}
/**
 * Fires a realistic order at your own webhook so you can watch the whole flow.
 *
 * The address is this server's own, worked out here — never taken from the browser. It used to post
 * to whatever `base` the caller sent and hand the reply back, which let any caller make this server
 * request any URL. And the token must be one of the caller's own channels (RLS answers that).
 */
export async function sendTestOrder(token: string, _base?: string) {
  void _base;
  const s = await createClient();
  const { data: mine } = await s.from("order_channels").select("id").eq("webhook_token", token).maybeSingle();
  if (!mine) return { error: "That channel is not on this property." };
  /* 2026-10-25 (audit): straight to what the webhook route does — `ingest_online_order` with the channel's token — on a
     client of its own. It fetched this server's own URL built from the Host / X-Forwarded-* headers, which a caller can set:
     on a self-hosted build that pointed the server at any address (SSRF) and handed the reply back. */
  const { createClient: plain } = await import("@supabase/supabase-js");
  const hook = plain(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data, error } = await hook.rpc("ingest_online_order", { p_token: token, p_payload: { id: `TEST-${Date.now().toString().slice(-6)}`, customer_name: "Test customer", customer_phone: "9840000000", address: "12 Test Street", total: 605,
    items: [{ name: "Chicken biryani", qty: 2, price: 280 }, { name: "Butter naan", qty: 1, price: 45 }] } });
  revalidatePath("/online-orders"); revalidatePath("/channels");
  return error ? { error: error.message.includes("unknown channel") ? "unknown channel" : "could not record the test order" } : { ok: true, ...((data ?? {}) as Record<string, unknown>) };
}
