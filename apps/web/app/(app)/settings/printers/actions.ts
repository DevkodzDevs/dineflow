"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
const bump = () => revalidatePath("/settings/printers");
export async function savePrinter(fd: FormData) {
  const s = await createClient(); const id = fd.get("id") as string | null;
  const row = { name: String(fd.get("name")), kind: String(fd.get("kind")), transport: String(fd.get("transport")), width: Number(fd.get("width") || 80), address: (fd.get("address") as string) || null, station: (fd.get("station") as string) || null, copies: Number(fd.get("copies") || 1), cut: fd.get("cut") === "on", drawer: fd.get("drawer") === "on", footer: (fd.get("footer") as string) || null, is_default: fd.get("is_default") === "on" };
  const { error } = await (id ? s.from("printers").update(row).eq("id", id) : s.from("printers").insert(row));
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function deletePrinter(id: string) { const s = await createClient(); await s.from("printers").delete().eq("id", id); bump(); return { ok: true }; }
