"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NewJob = {
  title: string; details: string; category: string; department: string | null; place: string; room: string | null; table: string | null;
  priority: number; guest: boolean; due: string | null; assigned: string | null; labourer: string | null; repeat: number;
};
/** Anyone signed in raises a job (0113 `job_add`): the category picks the department unless one is named, the priority
 *  picks the due time unless one is given; giving it to a person or a labourer is a supervisor's move (the function says so). */
export async function addJob(j: NewJob) {
  const s = await createClient();
  const { data, error } = await s.rpc("job_add", {
    p_title: j.title.trim(), p_details: j.details.trim() || null, p_category: j.category, p_department: j.department || null, p_place: j.place.trim() || null,
    p_room: j.room || null, p_table: j.table || null, p_priority: j.priority, p_guest: j.guest, p_due: j.due || null,
    p_assigned: j.assigned || null, p_labourer: j.labourer || null, p_repeat: j.repeat,
  });
  if (error) return { error: error.message };
  ["/work", "/cleaning", "/housekeeping", "/dashboard"].forEach((p) => revalidatePath(p));
  return { ok: true as const, job: data as { id: string; department: string | null; due_at: string } };
}
