"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
export async function setLabourStatus(id: string, status: "active" | "inactive") { const s = await createClient(); await s.from("labourers").update({ status }).eq("id", id); bump(); return { ok: true }; }
export async function punchCode(code: string) { const s = await createClient(); const { data, error } = await s.rpc("labour_punch", { p_code: code }); if (error) return { error: error.message }; bump(); return { ok: true, ...(data as object) }; }
export async function markAttendance(labourerId: string, date: string, present: boolean, wage: number, note?: string) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  if (!present) { await s.from("labour_attendance").delete().eq("labourer_id", labourerId).eq("work_date", date); bump(); return { ok: true }; }
  const { error } = await s.from("labour_attendance").upsert({ labourer_id: labourerId, work_date: date, wage, note: note ?? null, in_at: new Date().toISOString(), created_by: user?.id }, { onConflict: "labourer_id,work_date" });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
export async function payLabour(labourerId: string, amount: number, method: string, from: string, to: string, note: string) {
  const s = await createClient(); const { data: { user } } = await s.auth.getUser();
  const { error } = await s.from("labour_payments").insert({ labourer_id: labourerId, amount, method, period_from: from || null, period_to: to || null, note: note || null, created_by: user?.id });
  if (error) return { error: error.message }; bump(); return { ok: true };
}
