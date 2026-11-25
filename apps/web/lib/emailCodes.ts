import "server-only";
import { adminClient, serviceRoleConfigured } from "@/lib/supabase/admin";
import type { SendResult } from "@/lib/email";

/**
 * 0196: the database mints an email code for whoever asks (staff_email_code, public_email_code) but never hands it back to
 * them — only the service role can read it, once, within 5 minutes (email_code_reveal), and this is the only place that
 * does: it reads the code and emails it. So an owner (or a stranger on /signup) cannot skip the email by reading the code
 * from the API. Without SUPABASE_SERVICE_ROLE_KEY on the server no code can be sent, and the screen says so.
 */
export const CODES_OFF = "Email codes are off on this server: it needs SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API).";

export async function revealAndSend(id: string, mail: (to: string, code: string, property: string) => Promise<SendResult>):
  Promise<{ ok: true; echoed: string | null } | { error: string }> {
  if (!serviceRoleConfigured()) return { error: CODES_OFF };
  const { data, error } = await adminClient().rpc("email_code_reveal", { p_id: id });
  if (error) return { error: error.message };
  const r = data as { email: string; code: string; property: string | null };
  const sent = await mail(r.email, r.code, r.property ?? "");
  if (!sent.ok) return { error: sent.error };
  return { ok: true, echoed: sent.echoed ?? null };
}
