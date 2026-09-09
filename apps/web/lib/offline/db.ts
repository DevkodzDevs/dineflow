/**
 * IndexedDB, no dependencies. Three stores:
 *   outbox — writes waiting for a connection, oldest first
 *   cache  — the last good answer for any query, so a screen opens with real data offline
 *   meta   — sync bookkeeping (last successful flush, last reconcile)
 */
const DB = "dineflow", VERSION = 3;
export type JobKind = "place_order" | "settle_bill" | "generate_bill" | "stock" | "punch" | "item_status" | "kot_status" | "walkin_add" | "walkin_set" | "stock_count" | "hk_status" | "table_status";
export type Job = { id: string; kind: JobKind; args: Record<string, unknown>; at: number; tries: number; error?: string; label: string; nextTry?: number };
export type Cached<T> = { v: T; at: number };

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no indexeddb"));
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => { const d = r.result; for (const s of ["outbox", "cache", "meta"]) if (!d.objectStoreNames.contains(s)) s === "outbox" ? d.createObjectStore(s, { keyPath: "id" }) : d.createObjectStore(s); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
const tx = async <T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(store, mode); const rq = fn(t.objectStore(store)); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
};
export const putJob = (j: Job) => tx("outbox", "readwrite", (s) => s.put(j));
export const delJob = (id: string) => tx("outbox", "readwrite", (s) => s.delete(id));
export const allJobs = async (): Promise<Job[]> => { try { return await tx<Job[]>("outbox", "readonly", (s) => s.getAll() as IDBRequest<Job[]>); } catch { return []; } };
export const cacheSet = (k: string, v: unknown) => tx("cache", "readwrite", (s) => s.put({ v, at: Date.now() } as Cached<unknown>, k)).catch(() => {});
export const cacheGet = async <T>(k: string): Promise<Cached<T> | null> => { try { return (await tx<Cached<T> | undefined>("cache", "readonly", (s) => s.get(k) as IDBRequest<Cached<T> | undefined>)) ?? null; } catch { return null; } };
export const metaSet = (k: string, v: unknown) => tx("meta", "readwrite", (s) => s.put(v, k)).catch(() => {});
export const metaGet = async <T>(k: string): Promise<T | null> => { try { return (await tx<T | undefined>("meta", "readonly", (s) => s.get(k) as IDBRequest<T | undefined>)) ?? null; } catch { return null; } };
