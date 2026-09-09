"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function myId() {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { data: p } = await s.from("profiles").select("restaurant_id").eq("id", user!.id).maybeSingle();
  return p?.restaurant_id ?? ((await s.rpc("admin_acting_as")).data as string);
}
export async function saveStorefront(fd: FormData) {
  const s = await createClient(); const rid = await myId();
  const cuisines = String(fd.get("cuisines") || "").split(",").map((x) => x.trim()).filter(Boolean);
  const photos = String(fd.get("photos") || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  const { error } = await s.from("restaurants").update({
    is_listed: fd.get("is_listed") === "on", dining_enabled: fd.get("dining_enabled") === "on",
    delivery_enabled: fd.get("delivery_enabled") === "on", takeaway_enabled: fd.get("takeaway_enabled") === "on",
    cuisines, photos, price_for_two: Number(fd.get("price_for_two") || 0) || null,
    opens_at: String(fd.get("opens_at") || "11:00"), closes_at: String(fd.get("closes_at") || "23:00"),
    slot_minutes: Number(fd.get("slot_minutes") || 30), seats_per_slot: Number(fd.get("seats_per_slot") || 0) || null,
    min_order: Number(fd.get("min_order") || 0), delivery_fee: Number(fd.get("delivery_fee") || 0),
    packing_charge: Number(fd.get("packing_charge") || 0), delivery_radius_km: Number(fd.get("delivery_radius_km") || 6),
    tagline: (fd.get("tagline") as string) || null,
  }).eq("id", rid);
  if (error) return { error: error.message };
  revalidatePath("/settings/storefront"); revalidatePath("/reservations"); return { ok: true };
}

