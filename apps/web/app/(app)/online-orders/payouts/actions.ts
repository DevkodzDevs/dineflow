"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type Expected = { orders: number; gross: number; commission: number; payout: number };

/** What the channel's orders in the period say it owes (0105 settlement_expected; owner or manager). */
export async function expectedFor(channel: string, from: string, to: string) {
  const s = await createClient();
  const { data, error } = await s.rpc("settlement_expected", { p_channel: channel, p_from: from, p_to: to });
  if (error) return { error: error.message }; return { ok: true as const, e: data as Expected };
}

export async function addSettlement(x: { channel: string; from: string; to: string; received: number; tds: number; other: number; utr: string; received_on: string; note: string }) {
  const s = await createClient();
  const { error } = await s.rpc("settlement_add", { p_channel: x.channel, p_from: x.from, p_to: x.to, p_received: x.received, p_tds: x.tds || 0, p_other: x.other || 0, p_utr: x.utr || null, p_received_on: x.received_on || null, p_note: x.note || null });
  if (error) return { error: error.message };
  revalidatePath("/online-orders/payouts"); return { ok: true as const };
}

export async function deleteSettlement(id: string) {
  const s = await createClient();
  const { error } = await s.rpc("settlement_delete", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/online-orders/payouts"); return { ok: true as const };
}
