"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import { toLoginAddress } from "@dineflow/shared";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);

export async function login(_: unknown, fd: FormData) {
  const supabase = await createClient();
  // Typing the bare code is enough: dine-htl-mano-00001 becomes the full sign-in address, while a
  // real email typed in full is left alone. Same rule the create form shows.
  const email = toLoginAddress(String(fd.get("email") ?? ""));
  // Enforce temp password lockout before the sign-in attempt. If the password has been live for more
  // than 4 days without the owner changing it, the hash is scrambled and the attempt will fail with
  // "Invalid login credentials" — which is the right answer, because the password genuinely no
  // longer works. The owner must ask Master control for a new one.
  if (serviceRoleConfigured()) {
    try { await adminClient().rpc("enforce_temp_password_lockout"); } catch { /* best-effort */ }
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password: String(fd.get("password")) });
  if (error) return { error: error.message };
  // the master's credentials open Master control and nothing else; owners open their own property
  const { data: master } = await supabase.rpc("is_master");
  redirect(master ? "/admin" : "/dashboard");
}

export async function signup(_: unknown, fd: FormData) {
  const supabase = await createClient();
  const email = String(fd.get("email")), password = String(fd.get("password"));
  const fullName = String(fd.get("full_name")), restaurant = String(fd.get("restaurant")), type = String(fd.get("property_type") || "restaurant");
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) return { error: error.message };
  if (!data.session) return { error: "Check your inbox to confirm your email, then sign in." };
  const { error: e2 } = await supabase.rpc("create_restaurant", { p_name: restaurant, p_slug: slugify(restaurant), p_full_name: fullName, p_type: type });
  if (e2) return { error: e2.message };
  redirect("/dashboard");
}

export async function join(_: unknown, fd: FormData) {
  const supabase = await createClient();
  // Not upper-cased any more: an invite code is hex and case-insensitive on the way in, but a
  // DineFlow code is lower case and matching it is done case-insensitively in the database.
  const code = String(fd.get("code")).trim();
  const fullName = String(fd.get("full_name"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const { data, error } = await supabase.auth.signUp({ email: String(fd.get("email")), password: String(fd.get("password")), options: { data: { full_name: fullName } } });
    if (error) return { error: error.message };
    if (!data.session) return { error: "Check your inbox to confirm your email, then come back to this page." };
  }
  const { data, error } = await supabase.rpc("join_restaurant", { p_code: code, p_full_name: fullName });
  if (error) return { error: error.message };
  // A DineFlow code gets you in the door but switched off, so there is nothing to show on the
  // dashboard yet. An invite code carries its role and goes straight through.
  const joined = data as { pending?: boolean } | null;
  redirect(joined?.pending ? "/join?pending=1" : "/dashboard");
}
