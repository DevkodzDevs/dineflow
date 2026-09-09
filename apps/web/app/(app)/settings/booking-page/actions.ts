"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
export async function saveBookingPage(fd: FormData) {
  const s = await createClient();
  const { data: { user } } = await s.auth.getUser(); if (!user) return { error: "not signed in" };
  const { data: p } = await s.from("profiles").select("restaurant_id").eq("id", user.id).single();
  const { error } = await s.from("restaurants").update({ booking_slug: String(fd.get("booking_slug")).toLowerCase(), tagline: (fd.get("tagline") as string) || null, policies: (fd.get("policies") as string) || null, advance_pct: Number(fd.get("advance_pct") || 0), booking_engine: fd.get("booking_engine") === "on" }).eq("id", p!.restaurant_id);
  if (error) return { error: error.message.includes("duplicate") ? "That address is taken, try another" : error.message };
  revalidatePath("/settings/booking-page"); revalidatePath("/channels"); return { ok: true };
}
