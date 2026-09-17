"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPasswordCode } from "@/lib/email";

/**
 * Step one: post a one-time code to the address Master control recorded for this owner.
 *
 * The database mints the code and hands back the plaintext exactly once, here, so it can be put in
 * an email. It is never returned to the browser — except under DINEFLOW_OTP_ECHO, which exists for
 * a machine with no mail account and says so on screen.
 */
export async function requestCode() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("request_password_otp");
  if (error) return { error: error.message };
  const { code, sent_to } = data as { code: string; sent_to: string };

  const { data: profile } = await supabase
    .from("profiles").select("restaurant_id, restaurants(name)").eq("id", user.id).maybeSingle();
  const property = (profile as { restaurants?: { name?: string } } | null)?.restaurants?.name ?? "your property";

  const sent = await sendPasswordCode(sent_to, code, property);
  if (!sent.ok) return { error: sent.error };
  return { ok: true, sentTo: mask(sent_to), echoed: sent.echoed };
}

/** Step two: check the code. The window it opens is held in the database, not in the browser. */
export async function verifyCode(_: unknown, fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("verify_password_otp", { p_code: String(fd.get("code") ?? "") });
  if (error) return { error: error.message };
  return { ok: true };
}

/** Step three: set the password. Supabase enforces its own rules; the flag clears only after. */
export async function changePassword(_: unknown, fd: FormData) {
  const next = String(fd.get("password") ?? "");
  const again = String(fd.get("confirm") ?? "");
  if (next.length < 8) return { error: "Use at least 8 characters." };
  if (next !== again) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };

  // Refuses unless a code was verified in the last fifteen minutes, so this cannot be called
  // straight past the code step.
  const { error: flagError } = await supabase.rpc("clear_password_change_flag");
  if (flagError) return { error: flagError.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** p****a@gmail.com — enough to recognise your own address, not enough to learn someone else's. */
function mask(address: string) {
  const [name, domain] = address.split("@");
  if (!domain) return address;
  const shown = name.length <= 2 ? name.slice(0, 1) : name[0] + "*".repeat(Math.min(name.length - 2, 6)) + name.slice(-1);
  return `${shown}@${domain}`;
}
