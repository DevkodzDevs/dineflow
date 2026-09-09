import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { supabase } from "./supabase";

/**
 * The phone's outbox. Anything punched without a signal is stored on the device and sent, oldest
 * first, the moment the line returns. The server de-duplicates by client_id, so a job that was
 * actually delivered before the connection dropped can be retried safely.
 */
export type JobKind = "place_order" | "settle_bill" | "generate_bill" | "item_status" | "kot_status" | "table_status" | "hk_status" | "walkin_add" | "walkin_set" | "stock" | "stock_count" | "punch";
export type Job = { id: string; kind: JobKind; args: Record<string, unknown>; at: number; tries: number; label: string; nextTry?: number; error?: string };
const KEY = "dineflow.outbox";
const read = async (): Promise<Job[]> => { try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]"); } catch { return []; } };
const write = (j: Job[]) => AsyncStorage.setItem(KEY, JSON.stringify(j));

export type QueueState = { pending: number; online: boolean; syncing: boolean; justSynced: number; lastError: string | null };
const listeners = new Set<(n: QueueState) => void>();
let state: QueueState = { pending: 0, online: true, syncing: false, justSynced: 0, lastError: null };
const set = async (p: Partial<QueueState>) => { state = { ...state, ...p, pending: (await read()).length }; listeners.forEach((l) => l(state)); };
export const onQueue = (fn: (n: QueueState) => void) => { listeners.add(fn); void set({}); return () => listeners.delete(fn); };

export async function enqueue(kind: JobKind, args: Record<string, unknown>, label: string) {
  const jobs = await read();
  jobs.push({ id: `${Date.now()}${Math.random().toString(16).slice(2)}`, kind, args, at: Date.now(), tries: 0, label });
  await write(jobs); await set({}); void flush();
}

async function run(j: Job) {
  const a = j.args as Record<string, never>;
  const fail = (e: { message?: string } | null) => { if (e) throw e; };
  switch (j.kind) {
    case "place_order": fail((await supabase.rpc("place_order", { p_table_id: a.table_id, p_type: a.type, p_items: a.items, p_customer: a.customer, p_note: a.note, p_client_id: a.client_id, p_placed_at: a.placed_at })).error); break;
    case "generate_bill": fail((await supabase.rpc("generate_bill", { p_order_id: a.order_id, p_discount_pct: a.disc_pct, p_discount_amount: a.disc_amt })).error); break;
    case "settle_bill": fail((await supabase.rpc("settle_bill", { p_bill_id: a.bill_id, p_payments: a.payments, p_client_id: a.client_id })).error); break;
    case "item_status": fail((await supabase.from("order_items").update({ status: a.status }).in("id", a.ids as unknown as string[])).error); break;
    case "kot_status": fail((await supabase.from("kots").update({ status: a.status }).eq("id", a.id)).error); break;
    case "table_status": fail((await supabase.from("dining_tables").update({ status: a.status }).eq("id", a.id)).error); break;
    case "hk_status": fail((await supabase.from("housekeeping_tasks").update({ status: a.status }).eq("id", a.id)).error); break;
    case "walkin_add": fail((await supabase.rpc("walkin_add", { p_name: a.name, p_phone: a.phone, p_party: a.party })).error); break;
    case "walkin_set": fail((await supabase.rpc("walkin_set", { p_id: a.id, p_status: a.status, p_table: a.table ?? null })).error); break;
    case "stock_count": fail((await supabase.rpc("stock_count", { p_counts: a.counts })).error); break;
    case "stock": fail((await supabase.from("stock_ledger").insert(j.args as never)).error); break;
    case "punch": fail((await supabase.rpc("labour_punch", { p_code: a.code })).error); break;
  }
}
/** Bad data will never succeed however long we wait; a bad connection will. Only the first is dropped. */
const permanent = (m: string) => /duplicate|violates|not found|permission|invalid input|already/i.test(m);

let busy = false;
export async function flush(): Promise<number> {
  if (busy || !state.online) return 0;
  busy = true; await set({ syncing: true }); let sent = 0;
  try {
    for (const j of (await read()).sort((a, b) => a.at - b.at)) {
      if (j.nextTry && Date.now() < j.nextTry) continue;
      try { await run(j); await write((await read()).filter((x) => x.id !== j.id)); sent++; await set({ lastError: null }); }
      catch (e) {
        const msg = (e as { message?: string }).message ?? "failed";
        const all = await read(); const i = all.findIndex((x) => x.id === j.id); if (i < 0) continue;
        if (permanent(msg) || all[i].tries >= 6) { all.splice(i, 1); await write(all); await set({ lastError: `Dropped "${j.label}": ${msg}` }); }
        else { all[i] = { ...all[i], tries: all[i].tries + 1, error: msg, nextTry: Date.now() + Math.min(60000, 2 ** all[i].tries * 1000) }; await write(all); await set({ lastError: msg }); if (!state.online) break; }
      }
    }
  } finally {
    busy = false; await set({ syncing: false, justSynced: sent });
    if (sent) setTimeout(() => void set({ justSynced: 0 }), 4000);
  }
  return sent;
}

export function startQueue() {
  const un = NetInfo.addEventListener((s) => {
    const was = state.online; const now = !!s.isConnected && s.isInternetReachable !== false;
    void set({ online: now }); if (!was && now) void flush();
  });
  const t = setInterval(() => void flush(), 15000);
  return () => { un(); clearInterval(t); };
}
