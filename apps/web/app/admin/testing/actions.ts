"use server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

/** The browser suite runs in the master's own browser; this keeps its result with the others. */
export async function recordRun(suite: string, status: "pass" | "warn" | "fail", ms: number, checks: unknown[]) {
  const a = await requireAdmin(); const s = await createClient();
  const { error } = await s.from("selftest_runs").insert({ suite, status, ms: Math.round(ms), checks: checks.slice(0, 400), ran_by: a.userId });
  if (error) return { error: error.message };
  return { ok: true as const };
}
