"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const done = (extra: Record<string, unknown> = {}) => { revalidatePath("/payroll"); return { ok: true as const, ...extra }; };
const call = async (fn: string, args: Record<string, unknown>) => { const s = await createClient(); return s.rpc(fn, args); };

/** PF and ESI on or off, and the paid weekly offs a month (0106; owner or manager — the functions check). */
export async function saveSettings(pf: boolean, esi: boolean, offs: number, wageRule: boolean) {
  const { error } = await call("payroll_settings_save", { p_pf: pf, p_esi: esi, p_paid_offs: offs, p_wage_rule: wageRule });
  if (error) return { error: error.message }; revalidatePath("/", "layout"); return done();
}
/** `basicPct`: the share of pay that is basic + DA — PF is worked on that (0109). */
export async function setPay(profile: string, basis: "monthly" | "daily", amount: number, pf: boolean, esi: boolean, basicPct: number) {
  const { error } = await call("staff_pay_set", { p_profile: profile, p_basis: basis, p_amount: amount, p_pf: pf, p_esi: esi, p_basic_pct: basicPct });
  if (error) return { error: error.message }; return done();
}
export async function giveAdvance(profile: string, amount: number, method: string, note: string) {
  const { error } = await call("advance_add", { p_profile: profile, p_amount: amount, p_method: method, p_note: note || null });
  if (error) return { error: error.message }; ["/controls"].forEach((p) => revalidatePath(p)); return done();
}
/** Work the month out (again, while it is a draft). `month` is YYYY-MM. */
export async function buildMonth(month: string) {
  const { data, error } = await call("payroll_build", { p_month: `${month}-01` });
  if (error) return { error: error.message }; return done({ run: data as string });
}
export async function setLine(line: string, bonus: number, other: number, note: string) {
  const { error } = await call("payroll_line_set", { p_line: line, p_bonus: bonus, p_other: other, p_note: note || null });
  if (error) return { error: error.message }; return done();
}
export async function finalise(run: string) {
  const { error } = await call("payroll_finalise", { p_run: run });
  if (error) return { error: error.message }; return done();
}
/** Pay one person's line: it becomes a Salaries expense (cash paid today leaves the drawer). */
export async function payLine(line: string, method: string) {
  const { error } = await call("payroll_pay", { p_line: line, p_method: method });
  if (error) return { error: error.message }; ["/expenses", "/controls", "/reports"].forEach((p) => revalidatePath(p)); return done();
}
