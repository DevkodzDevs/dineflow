"use client";
import { createClient } from "@/lib/supabase/client";
import { allJobs, delJob, putJob, metaSet, type Job, type JobKind } from "./db";

type State = { online: boolean; pending: number; syncing: boolean; lastError: string | null; lastSyncAt: number | null; justSynced: number };
type Listener = (s: State) => void;
const listeners = new Set<Listener>();
let state: State = { online: true, pending: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 };
const emit = () => listeners.forEach((l) => l(state));
export const subscribe = (l: Listener) => { listeners.add(l); l(state); return () => listeners.delete(l); };
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

/** Anything queued shows on screen straight away; these listeners let a screen paint its own optimistic row. */
type QueueListener = (jobs: Job[]) => void;
const qls = new Set<QueueListener>();
export const onQueue = (l: QueueListener) => { qls.add(l); void allJobs().then(l); return () => qls.delete(l); };
const pushQueue = async () => { const j = await allJobs(); set({ pending: j.length }); qls.forEach((l) => l(j)); };

/** Queue a write. Returns at once — the person keeps working whether or not there is a connection. */
export async function enqueue(kind: JobKind, args: Record<string, unknown>, label: string) {
  const job: Job = { id: crypto.randomUUID(), kind, args, at: Date.now(), tries: 0, label };
  await putJob(job); await pushQueue(); void flush();
  return job.id;
}

async function run(job: Job) {
  const s = createClient();
  const fail = (e: { message?: string } | null) => { if (e) throw e; };
  switch (job.kind) {
    case "place_order": { const a = job.args as Record<string, never>; fail((await s.rpc("place_order", { p_table_id: a.table_id, p_type: a.type, p_items: a.items, p_customer: a.customer, p_note: a.note, p_client_id: a.client_id, p_placed_at: a.placed_at })).error); break; }
    case "generate_bill": { const a = job.args as Record<string, never>; fail((await s.rpc("generate_bill", { p_order_id: a.order_id, p_discount_pct: a.disc_pct, p_discount_amount: a.disc_amt })).error); break; }
    case "settle_bill": { const a = job.args as Record<string, never>; fail((await s.rpc("settle_bill", { p_bill_id: a.bill_id, p_payments: a.payments, p_client_id: a.client_id })).error); break; }
    case "item_status": { const a = job.args as { ids: string[]; status: string }; fail((await s.from("order_items").update({ status: a.status }).in("id", a.ids)).error); break; }
    case "kot_status": { const a = job.args as { id: string; status: string }; fail((await s.from("kots").update({ status: a.status }).eq("id", a.id)).error); break; }
    case "table_status": { const a = job.args as { id: string; status: string }; fail((await s.from("dining_tables").update({ status: a.status }).eq("id", a.id)).error); break; }
    case "hk_status": { const a = job.args as { id: string; status: string }; fail((await s.from("housekeeping_tasks").update({ status: a.status }).eq("id", a.id)).error); break; }
    case "walkin_add": { const a = job.args as Record<string, never>; fail((await s.rpc("walkin_add", { p_name: a.name, p_phone: a.phone, p_party: a.party })).error); break; }
    case "walkin_set": { const a = job.args as Record<string, never>; fail((await s.rpc("walkin_set", { p_id: a.id, p_status: a.status, p_table: a.table ?? null })).error); break; }
    case "stock_count": { const a = job.args as { counts: unknown }; fail((await s.rpc("stock_count", { p_counts: a.counts })).error); break; }
    case "stock": { fail((await s.from("stock_ledger").insert(job.args)).error); break; }
    case "punch": { const a = job.args as { code: string }; fail((await s.rpc("labour_punch", { p_code: a.code })).error); break; }
  }
}

/** A rejection that will never succeed however many times we try — bad data, not a bad connection. */
const permanent = (msg: string) => /duplicate|violates|not found|permission|invalid input|already/i.test(msg);

let running = false;
export async function flush(): Promise<number> {
  if (running || typeof navigator === "undefined" || !navigator.onLine) return 0;
  running = true; set({ syncing: true });
  let sent = 0;
  try {
    const jobs = (await allJobs()).sort((a, b) => a.at - b.at);
    for (const j of jobs) {
      if (j.nextTry && Date.now() < j.nextTry) continue;                 // still backing off
      try { await run(j); await delJob(j.id); sent++; set({ lastError: null }); await pushQueue(); }
      catch (e) {
        const msg = (e as { message?: string }).message ?? "failed";
        if (permanent(msg) || j.tries >= 6) { await delJob(j.id); set({ lastError: `Dropped "${j.label}": ${msg}` }); await pushQueue(); }
        else {
          const wait = Math.min(60000, 2 ** j.tries * 1000);              // 1s, 2s, 4s … capped at a minute
          await putJob({ ...j, tries: j.tries + 1, error: msg, nextTry: Date.now() + wait });
          set({ lastError: msg }); await pushQueue();
          if (!navigator.onLine) break;
        }
      }
    }
  } finally {
    running = false;
    const at = sent ? Date.now() : state.lastSyncAt;
    if (sent) void metaSet("lastSyncAt", at);
    set({ syncing: false, lastSyncAt: at, justSynced: sent ? sent : 0 });
    if (sent) { window.dispatchEvent(new CustomEvent("dineflow:synced", { detail: { sent } })); setTimeout(() => set({ justSynced: 0 }), 4000); }
  }
  return sent;
}

export function startSync() {
  if (typeof window === "undefined") return;
  const on = () => { set({ online: true }); void flush(); };
  const off = () => set({ online: false });
  window.addEventListener("online", on); window.addEventListener("offline", off);
  // a connection can come back without the browser noticing; a quiet ping every 20 s catches it
  const probe = async () => { if (state.online) return; try { const r = await fetch("/api/health", { cache: "no-store" }); if (r.ok) on(); } catch { /* still out */ } };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void flush(); });
  set({ online: navigator.onLine }); void pushQueue();
  const t = setInterval(() => { void flush(); void probe(); }, 15000);
  return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
}
