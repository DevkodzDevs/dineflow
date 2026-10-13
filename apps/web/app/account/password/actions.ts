"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import { sendPasswordCode } from "@/lib/email";

/**
 * Step one: post a one-time code to the address Master control recorded for this owner.
 *
 * The database mints the code and hands back the plaintext exactly once, here, so it can be put in
 * an email. It is never returned to the browser — except under DINEFLOW_OTP_ECHO, which exists for
 * a machine with no mail account and says so on screen.
 *
 * It is minted through the service role for the user this session proves (0098). The session's own
 * request_password_otp handed the plain code to whoever held the session — a till left signed in was
 * enough to read it straight from the API and pass the "emailed code" check. 0099 closes that one.
 */
export async function requestCode() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = serviceRoleConfigured()
    ? await adminClient().rpc("request_password_otp_for", { p_user: user.id })
    : await supabase.rpc("request_password_otp");
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
  const { data, error } = await supabase.rpc("verify_password_otp", { p_code: String(fd.get("code") ?? "") });
  if (error) return { error: error.message };
  // a wrong code is an answer, not an error (0098): raised, its try would have been un-counted
  const r = data as { ok?: boolean; error?: string } | null;
  if (r?.ok === false) return { error: r.error ?? "That code is not right." };
  return { ok: true };
}

/**
 * Set the password and clear the forced-change flag.
 *
 * Two paths, depending on how the user got here:
 *
 *   1. Through the OTP flow (voluntary change from Settings, or forced with a contact address):
 *      clear_password_change_flag() checks a verified OTP exists. This is the normal path.
 *
 *   2. First-time forced change with no contact address: the user just signed in with the
 *      temporary password, which proves who they are. Requiring an OTP that cannot be sent would
 *      trap them on this page forever. So when must_change_password is true and no OTP was
 *      verified, the flag is cleared directly — but ONLY if must_change_password is still true,
 *      meaning this is genuinely the first-time change, not a later one where the OTP was skipped.
 */
export async function changePassword(_: unknown, fd: FormData) {
  const next = String(fd.get("password") ?? "");
  const again = String(fd.get("confirm") ?? "");
  if (next.length < 8) return { error: "Use at least 8 characters." };
  if (next !== again) return { error: "The two passwords do not match." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Decide whether this change is allowed BEFORE making it. It used to set the password first and
  // check the code afterwards — so on a voluntary change (no forced reset pending) a session someone
  // else had picked up could change the password without the emailed code; the failed check came too
  // late to undo it.
  const { data: profile } = await supabase
    .from("profiles").select("must_change_password").eq("id", user.id).maybeSingle();
  const forced = !!profile?.must_change_password;
  if (!forced) {
    // voluntary change: the verified one-time code is required, and checked first
    const { error: flagError } = await supabase.rpc("clear_password_change_flag");
    if (flagError) return { error: flagError.message };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };

  if (forced) {
    // first-time forced change: the OTP path if a code was verified, otherwise the temporary password
    // they just signed in with is the proof (see above) — cleared only after the new password is set
    const { error: flagError } = await supabase.rpc("clear_password_change_flag");
    if (flagError) await supabase.rpc("clear_password_change_flag_forced");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Defer the password change and grant 3-day temporary access. */
export async function deferPasswordChange() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("defer_password_change");
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** p****a@gmail.com — enough to recognise your own address, not enough to learn someone else's. */
function mask(address: string) {
  const [name, domain] = address.split("@");
  if (!domain) return address;
  const shown = name.length <= 2 ? name.slice(0, 1) : name[0] + "*".repeat(Math.min(name.length - 2, 6)) + name.slice(-1);
  return `${shown}@${domain}`;
}
