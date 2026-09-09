"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);

export async function login(_: unknown, fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
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
  const code = String(fd.get("code")).trim().toUpperCase();
  const fullName = String(fd.get("full_name"));
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const { data, error } = await supabase.auth.signUp({ email: String(fd.get("email")), password: String(fd.get("password")), options: { data: { full_name: fullName } } });
    if (error) return { error: error.message };
    if (!data.session) return { error: "Check your inbox to confirm your email, then come back to this page." };
  }
  const { error } = await supabase.rpc("join_restaurant", { p_code: code, p_full_name: fullName });
  if (error) return { error: error.message };
  redirect("/dashboard");
}
