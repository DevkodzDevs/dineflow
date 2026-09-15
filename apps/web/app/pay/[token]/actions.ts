"use server";
import { createClient } from "@supabase/supabase-js";
import type { PayInfo } from "./types";
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

/** The bill as the guest may see it. Polled while unpaid, so the page notices when the counter confirms. */
export async function payInfo(token: string) {
  const { data, error } = await anon().rpc("pay_link", { p_token: token });
  if (error) return { error: error.message };
  return { ok: true, info: data as PayInfo | null };
}

/** "I've paid by UPI" — a note for the counter, with the UTR if the guest has it. Changes nothing else. */
export async function claimPaid(token: string, ref: string) {
  const { error } = await anon().rpc("pay_link_claim", { p_token: token, p_ref: ref.slice(0, 40) || null });
  if (error) return { error: error.message };
  return { ok: true };
}
