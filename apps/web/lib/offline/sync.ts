"use client";
import { getClient } from "@/lib/supabase/lazy";
import { allJobs, delJob, putJob, metaSet, type Job, type JobKind } from "./db";

type State = { online: boolean; pending: number; held: number; syncing: boolean; lastError: string | null; lastSyncAt: number | null; justSynced: number };
type Listener = (s: State) => void;
const listeners = new Set<Listener>();
let state: State = { online: true, pending: 0, held: 0, syncing: false, lastError: null, lastSyncAt: null, justSynced: 0 };
const emit = () => listeners.forEach((l) => l(state));
export const subscribe = (l: Listener) => { listeners.add(l); l(state); return () => listeners.delete(l); };
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

/** Anything queued shows on screen straight away; these listeners let a screen paint its own optimistic row. */
type QueueListener = (jobs: Job[]) => void;
const qls = new Set<QueueListener>();
export const onQueue = (l: QueueListener) => { qls.add(l); void allJobs().then(l); return () => qls.delete(l); };
// "pending" is what the outbox is still working on; anything held is waiting on a person instead
const pushQueue = async () => { const j = await allJobs(); set({ pending: j.filter((x) => !x.held).length, held: j.filter((x) => x.held).length }); qls.forEach((l) => l(j)); };

/** The jobs the outbox has stopped trying on its own, newest first. */
export const heldJobs = async (): Promise<Job[]> => (await allJobs()).filter((j) => j.held).sort((a, b) => (b.heldAt ?? 0) - (a.heldAt ?? 0));

/** Put a held job back in the queue and try it straight away. */
export async function retryJob(id: string) {
  const j = (await allJobs()).find((x) => x.id === id); if (!j) return;
  await putJob({ ...j, held: false, heldAt: undefined, tries: 0, nextTry: undefined });
  await pushQueue(); set({ lastError: null }); void flush();
}
/** Throw a held job away. Only ever a person's decision, never the outbox's. */
export async function discardJob(id: string) { await delJob(id); await pushQueue(); }

/** Queue a write. Returns at once — the person keeps working whether or not there is a connection. */
/** The outlet this device is working in (set by OfflineProvider from the session). A queued write carries it, and is
 *  sent only while the device is in that outlet again — never into the outlet it happens to be in when the line returns. */
let currentOutlet: string | null = null;
export const setOfflineOutlet = (id: string | null) => { currentOutlet = id; };
export async function enqueue(kind: JobKind, args: Record<string, unknown>, label: string) {
  const job: Job = { id: crypto.randomUUID(), kind, args, at: Date.now(), tries: 0, label, outlet: currentOutlet ?? undefined };
  await putJob(job); await pushQueue(); void flush();
  return job.id;
}

/** A write that never reached the server — no answer at all (Wi-Fi with no internet, the line dropped mid-tap) — as opposed
 *  to the server answering "no". Chrome says "Failed to fetch", Safari "Load failed", Firefox "NetworkError…". */
export const isNetworkError = (e: unknown) => {
  const m = String((e as { message?: string } | null)?.message ?? e ?? "");
  return (e instanceof TypeError && !/is not a function|cannot read|undefined|null/i.test(m)) ||
    /failed to fetch|load failed|networkerror|network request failed|fetch failed|internet connection appears to be offline|err_internet_disconnected|err_network/i.test(m);
};
/** The browser can say "online" while nothing gets through (2026-11-03, the owner: "work perfectly when the internet is
 *  disconnected"). A send that got no answer marks the app offline; the 15 s probe of /api/health brings it back. */
export const markUnreachable = () => { if (state.online) set({ online: false }); };
/**
 * Send now, or keep it on the device. `send` is the screen's own online call; when the app is offline, or the send gets no
 * answer at all, the write goes to the outbox instead (`queue`) and null comes back — the screen carries on as if it had
 * gone. A refusal from the server (an error answer) is the screen's to show, as before.
 */
export async function sendOrQueue<T>(send: () => Promise<T>, queue: () => Promise<unknown>): Promise<T | null> {
  if (!state.online || (typeof navigator !== "undefined" && !navigator.onLine)) { await queue(); return null; }
  try { return await send(); }
  catch (e) { if (!isNetworkError(e)) throw e; markUnreachable(); await queue(); return null; }
}

async function run(job: Job) {
  // only reached when there is a queued write to send, which is long after the screen has painted
  const s = await getClient();
  const fail = (e: { message?: string } | null) => { if (e) throw e; };
  switch (job.kind) {
    case "place_order": {
      // the till queues the order as it would send it online: customer_name / customer_phone, and a delivery address
      const a = job.args as Record<string, never>;
      // 0165: Add items on an open order — a new kitchen ticket on it; client_id makes a replay a no-op
      if (a.add_to) { fail((await s.rpc("order_add_items", { p_order_id: a.add_to, p_items: a.items, p_note: a.note, p_client_id: a.client_id, p_placed_at: a.placed_at })).error); break; }
      const { data: id, error } = await s.rpc("place_order", { p_table_id: a.table_id, p_type: a.type, p_items: a.items, p_customer: a.customer ?? { name: a.customer_name ?? null, phone: a.customer_phone ?? null }, p_note: a.note, p_client_id: a.client_id, p_placed_at: a.placed_at, p_promise: a.promise ?? false });
      fail(error);
      // the order is in; an address that does not save must not send the order a second time (client_id would refuse it anyway)
      if (a.delivery_address && id) await s.rpc("order_delivery", { p_order: id, p_address: a.delivery_address });
      break;
    }
    case "generate_bill": { const a = job.args as Record<string, never>; fail((await s.rpc("generate_bill", { p_order_id: a.order_id, p_discount_pct: a.disc_pct, p_discount_amount: a.disc_amt })).error); break; }
    case "settle_bill": { const a = job.args as Record<string, never>; fail((await s.rpc("settle_bill", { p_bill_id: a.bill_id, p_payments: a.payments, p_client_id: a.client_id })).error); break; }
    case "item_status": { const a = job.args as { ids: string[]; status: string }; fail((await s.from("order_items").update({ status: a.status }).in("id", a.ids)).error); break; }
    // a bump moves the ticket's lines, as the online path does (setKotStatus): stock is drawn from the line
    // status (0092) and sync_kot_status rebuilds the ticket from its lines — setting kots.status directly took no
    // stock and the ticket jumped back
    case "kot_status": { const a = job.args as { id: string; status: string }; fail((await s.from("order_items").update({ status: a.status }).eq("kot_id", a.id).neq("status", "cancelled")).error); break; }
    case "kot_fire": { const a = job.args as { id: string }; fail((await s.rpc("fire_kot", { p_kot_id: a.id })).error); break; }
    case "table_status": { const a = job.args as { id: string; status: string }; fail((await s.from("dining_tables").update({ status: a.status }).eq("id", a.id)).error); break; }
    case "hk_status": { const a = job.args as { id: string; status: string }; fail((await s.from("housekeeping_tasks").update({ status: a.status }).eq("id", a.id)).error); break; }
    case "walkin_add": { const a = job.args as Record<string, never>; fail((await s.rpc("walkin_add", { p_name: a.name, p_phone: a.phone, p_party: a.party, p_client_id: a.client_id ?? null, p_note: a.note ?? null })).error); break; }   // 0168: a replay returns the same walk-in; 0179: the request too
    case "walkin_set": { const a = job.args as Record<string, never>; fail((await s.rpc("walkin_set", { p_id: a.id, p_status: a.status, p_table: a.table ?? null, p_more: a.more ?? [] })).error); break; }   // 0180: joined tables
    case "walkin_hold": { const a = job.args as { id: string; table: string; more?: string[] }; fail((await s.rpc("walkin_hold", { p_id: a.id, p_table: a.table, p_more: a.more ?? [] })).error); break; }
    // 0169: sent with when it was counted, so the sales since are kept (a job queued before has none: 0017's rule)
    case "stock_count": { const a = job.args as { counts: unknown; counted_at?: string }; fail((await s.rpc("stock_count", { p_counts: a.counts, p_counted_at: a.counted_at ?? null })).error); break; }
    case "stock": { fail((await s.from("stock_ledger").insert(job.args)).error); break; }
    case "punch": { const a = job.args as { code: string }; fail((await s.rpc("labour_punch", { p_code: a.code })).error); break; }
  }
}

/**
 * The write already landed — a retry of something the server had taken. Every queued write carries
 * a client id for exactly this, so the second attempt is refused as a duplicate. Nothing is lost by
 * forgetting it, and keeping it would show the person a failure that never happened.
 */
/* Narrowed 2026-11-03: a bare /already/ also matched refusals that mean "not done" ("the bill for this table is already out"),
   and those jobs were deleted as if they had landed. */
const alreadyDone = (msg: string) => /duplicate key|already exists|already paid|already settled|already accepted|already recorded/i.test(msg);
/** A rejection that will never succeed however many times we try — bad data, not a bad connection. */
const permanent = (msg: string) => /violates|not found|permission|invalid input|malformed|syntax/i.test(msg);

let running = false;
export async function flush(): Promise<number> {
  if (running || typeof navigator === "undefined" || !navigator.onLine || !state.online) return 0;
  running = true; set({ syncing: true });
  let sent = 0;
  try {
    const jobs = (await allJobs()).sort((a, b) => a.at - b.at);
    for (const j of jobs) {
      if (j.held) continue;                                              // waiting on a person, not on us
      if (j.outlet && currentOutlet && j.outlet !== currentOutlet) {     // taken in another outlet: wait for it
        set({ lastError: `"${j.label}" waits until this device is back in the outlet it was taken in` }); continue;
      }
      if (j.nextTry && Date.now() < j.nextTry) continue;                 // still backing off
      try { await run(j); await delJob(j.id); sent++; set({ lastError: null }); await pushQueue(); }
      catch (e) {
        const msg = (e as { message?: string }).message ?? "failed";
        // no answer at all: the line is down, not the job — stop here, keep its place, and wait for the probe
        if (isNetworkError(e)) { markUnreachable(); set({ lastError: null }); break; }
        if (alreadyDone(msg)) { await delJob(j.id); await pushQueue(); }
        else if (permanent(msg) || j.tries >= 6) {
          /* Held, not dropped. This used to delete the job outright, so an order taken from a guest
             on a bad connection could disappear with nothing but a toast to say so. It now stays in
             the outbox until somebody sends it again or decides to throw it away. */
          await putJob({ ...j, held: true, heldAt: Date.now(), error: msg, nextTry: undefined });
          set({ lastError: `"${j.label}" needs attention: ${msg}` }); await pushQueue();
        }
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
