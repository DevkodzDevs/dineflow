"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { wrote } from "@/lib/wrote";
import { labourerSchema } from "@dineflow/shared";
const bump = () => ["/labour", "/scan"].forEach((p) => revalidatePath(p));

export async function saveLabourer(fd: FormData) {
  const s = await createClient();
  const parsed = labourerSchema.safeParse(Object.fromEntries(fd)); if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = fd.get("id") as string | null; const d = { ...parsed.data, joined_on: parsed.data.joined_on || undefined };
  if (id) { const { error } = await s.from("labourers").update(d).eq("id", id); if (error) return { error: error.message }; }
  else { const { data: code } = await s.rpc("next_labour_code"); const { error } = await s.from("labourers").insert({ ...d, code }); if (error) return { error: error.message }; }
  bump(); return { ok: true };
}
export async function setLabourStatus(id: string, status: "active" | "inactive") {
  const s = await createClient(); const bad = wrote(await s.from("labourers").update({ status }).eq("id", id).select("id"), "That worker could not be changed.");
  if (bad) return bad; bump(); return { ok: true };
}
export async function punchCode(code: string) { const s = await createClient(); const { data, error } = await s.rpc("labour_punch", { p_code: code }); if (error) return { error: error.message }; bump(); return { ok: true, ...(data as object) }; }
export async function markAttendance(labourerId: string, date: string, present: boolean, wage: number, note?: string) {
  // through labour_mark (0086): it refuses when the owner has turned manual attendance off, and logs the punch
  const s = await createClient();
  const { error } = await s.rpc("labour_mark", { p_labourer: labourerId, p_date: date, p_present: present, p_wage: wage, p_note: note ?? null });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function payLabour(labourerId: string, amount: number, method: string, from: string, to: string, note: string) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { error } = await s.from("labour_payments").insert({ labourer_id: labourerId, amount, method, period_from: from || null, period_to: to || null, note: note || null, created_by: user?.id });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
