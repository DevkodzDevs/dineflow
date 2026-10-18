"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** A job (0111 / 0113): a table paid and left, a room's housekeeping task, or anything raised on Work. Every write
 *  is one of the clean_* / job_* functions, which check the caller and put the signed-in person's name and the
 *  time on it. */
export type JobKind = "table" | "room" | "job";
const done = () => { ["/cleaning", "/work", "/orders", "/housekeeping", "/rooms", "/dashboard"].forEach((p) => revalidatePath(p)); return { ok: true as const }; };
const call = async (fn: string, args: Record<string, unknown>) => {
  const s = await createClient(); const { error } = await s.rpc(fn, args);
  return error ? { error: error.message } : done();
};

/** I'll take it: the job is mine and its clock starts. */
export async function takeJob(kind: JobKind, id: string) { return call("clean_take", { p_kind: kind, p_id: id }); }
/** Done: by whoever is on it, the person it was given to, or a supervisor — with what was done, when there is something to say. */
export async function finishJob(kind: JobKind, id: string, note?: string) { return call("clean_done", { p_kind: kind, p_id: id, p_note: note?.trim() || null }); }
/** Give it back to the queue. */
export async function giveBack(kind: JobKind, id: string) { return call("clean_release", { p_kind: kind, p_id: id }); }
/** A supervisor gives the job to one person, or to nobody (`profile` null). */
export async function assignJob(kind: JobKind, id: string, profile: string | null) { return call("clean_assign", { p_kind: kind, p_id: id, p_profile: profile }); }
/** A supervisor gives a job to a day labourer, who has no sign-in: someone finishes it for them (0113). */
export async function assignLabour(id: string, labourer: string | null) { return call("job_assign_labour", { p_id: id, p_labourer: labourer }); }
/** A table that did not need it. */
export async function skipJob(id: string) { return call("clean_skip", { p_id: id, p_note: null }); }
/** A job dropped — by whoever raised it, is on it, or a supervisor (0113). */
export async function cancelJob(id: string, note?: string) { return call("job_cancel", { p_id: id, p_note: note?.trim() || null }); }
/** Owner or manager: a job for every table that is paid and left, or not. */
export async function saveCleanSettings(tables: boolean) {
  const s = await createClient(); const { error } = await s.rpc("clean_settings_save", { p_tables: tables });
  if (error) return { error: error.message }; revalidatePath("/cleaning"); return { ok: true as const };
}
