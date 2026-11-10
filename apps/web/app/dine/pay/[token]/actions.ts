"use server";
import { createClient } from "@supabase/supabase-js";

const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

export type PrepayInfo = { status: "pending" | "paid"; total: number; ref: string | null; name: string; track: string | null };

/** The held order's payment state, for the pay page to poll (0181 dine_prepay_status — no secret in it). */
export async function prepayStatus(token: string): Promise<PrepayInfo | null> {
  if (!/^[0-9a-f]{16,64}$/.test(token)) return null;
  const { data } = await anon().rpc("dine_prepay_status", { p_token: token });
  return (data as PrepayInfo | null) ?? null;
}
