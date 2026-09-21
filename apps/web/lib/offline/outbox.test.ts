/**
 * The outbox holds a guest's order while the line is down. What happens when a write keeps failing
 * is therefore not a detail: until this was fixed, a job that failed six times was deleted, and an
 * order taken on a bad connection could vanish with nothing but a toast to say so.
 *
 * These tests drive the real store — a stand-in IndexedDB, not a mock of our own code — and replace
 * only the network call at the bottom.
 *
 * Note on timing: enqueue() kicks off a flush of its own without waiting for it, and flush() refuses
 * to run twice at once. A test that queues and then flushes would race its own background flush and
 * see nothing happen, so the failure paths seed the store directly and drive flush() themselves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "./db";

/** the one seam: what the job would have sent to Supabase */
const rpc = vi.fn();
vi.mock("@/lib/supabase/lazy", () => ({
  getClient: async () => ({ rpc: (...a: unknown[]) => rpc(...a), from: () => ({}) }),
}));

const { enqueue, flush, retryJob, discardJob, heldJobs } = await import("./sync");
const { allJobs, delJob, putJob } = await import("./db");

const clear = async () => { for (const j of await allJobs()) await delJob(j.id); };
const only = async () => { const j = await allJobs(); expect(j).toHaveLength(1); return j[0]; };
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
/** wait for a background flush (the one enqueue and retryJob start) to reach a settled state */
const waitFor = async (cond: () => Promise<boolean>) => {
  for (let i = 0; i < 60; i++) { if (await cond()) return; await tick(10); }
  throw new Error("condition never became true");
};

/** an order: the kind of job whose loss would actually cost somebody money */
const seedOrder = async (over: Partial<Job> = {}): Promise<Job> => {
  const job = { id: crypto.randomUUID(), kind: "place_order" as const, at: Date.now(), tries: 0,
    label: "Table 4 · 3 items", args: { table_id: "t1", items: [{ qty: 1 }], client_id: "c-1" }, ...over };
  await putJob(job); return job;
};
/** let flush() past the back-off it just set, so the next attempt can be driven immediately */
const allowRetry = async () => { const [j] = await allJobs(); if (j) await putJob({ ...j, nextTry: undefined }); };

beforeEach(async () => { await tick(20); await clear(); rpc.mockReset(); });

describe("a write that keeps failing", () => {
  it("is retried with a growing wait, not given up on at once", async () => {
    rpc.mockResolvedValue({ error: { message: "network down" } });
    await seedOrder();
    await flush();
    const j = await only();
    expect(j.held).toBeFalsy();
    expect(j.tries).toBe(1);
    expect(j.nextTry).toBeGreaterThan(Date.now());     // backing off
  });

  it("is HELD once the retries run out — never deleted", async () => {
    rpc.mockResolvedValue({ error: { message: "network down" } });
    await seedOrder();
    for (let i = 0; i < 8; i++) {
      const [j] = await allJobs();
      if (!j || j.held) break;
      await allowRetry();
      await flush();
    }
    const j = await only();
    expect(j.held).toBe(true);
    expect(j.error).toMatch(/network down/);
    expect(j.args).toMatchObject({ client_id: "c-1" });   // the order itself is still here, intact
  });

  it("is held at once when the server says the data is wrong", async () => {
    rpc.mockResolvedValue({ error: { message: "new row violates row-level security policy" } });
    await seedOrder();
    await flush();
    const j = await only();
    expect(j.held).toBe(true);
    expect(j.tries).toBe(0);            // no point retrying bad data
  });

  it("stops being retried once held, so it cannot churn in the background", async () => {
    rpc.mockResolvedValue({ error: { message: "violates check constraint" } });
    await seedOrder();
    await flush();
    const before = rpc.mock.calls.length;
    await flush(); await flush();
    expect(rpc.mock.calls.length).toBe(before);
  });
});

describe("a write the server had already taken", () => {
  it("is dropped quietly rather than held as a failure", async () => {
    // every queued write carries a client id, so a repeat is refused as a duplicate: it DID land
    rpc.mockResolvedValue({ error: { message: "duplicate key value violates unique constraint" } });
    await seedOrder();
    await flush();
    expect(await allJobs()).toHaveLength(0);
  });
});

describe("what a person can do with a held job", () => {
  it("sends it again, and it clears when it succeeds", async () => {
    rpc.mockResolvedValue({ error: { message: "violates something" } });
    await seedOrder();
    await flush();
    expect(await heldJobs()).toHaveLength(1);

    rpc.mockResolvedValue({ error: null });            // whatever was wrong has been put right
    const [held] = await heldJobs();
    await retryJob(held.id);                            // starts a flush of its own
    await waitFor(async () => (await allJobs()).length === 0);
  });

  it("throws it away only when asked", async () => {
    rpc.mockResolvedValue({ error: { message: "violates something" } });
    await seedOrder();
    await flush();
    const [held] = await heldJobs();
    expect(held).toBeDefined();
    await discardJob(held.id);
    expect(await allJobs()).toHaveLength(0);
  });
});

describe("the ordinary path", () => {
  it("a queued write is stored, sent, and leaves the outbox empty", async () => {
    rpc.mockResolvedValue({ error: null });
    await enqueue("place_order", { table_id: "t1", client_id: "c-2" }, "Table 9 · 1 item");
    await waitFor(async () => (await allJobs()).length === 0);
    expect(rpc).toHaveBeenCalled();
  });
});
