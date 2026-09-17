"use server";
import { createClient } from "@/lib/supabase/server";
import type { PropertyType } from "@dineflow/shared";

/**
 * Spin up a self-destructing demo property. The RPC is callable by anon since the login page has no
 * session. It returns a login email and password that the caller uses to sign in immediately.
 */
export async function createDemo(type: PropertyType) {
  const supabase = await createClient();
  // sweep expired demos opportunistically
  try { await supabase.rpc("sweep_expired_demos"); } catch { /* best effort */ }
  const { data, error } = await supabase.rpc("create_demo_sandbox", { p_type: type });
  if (error) return { error: error.message };
  const d = data as { login_email: string; password: string; type: string; expires_in_hours: number };

  // sign in as the demo user immediately
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: d.login_email, password: d.password,
  });
  if (signErr) return { error: signErr.message };
  return { ok: true as const, ...d };
}
