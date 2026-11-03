/**
 * 2026-11-03 — "work perfectly when the internet is disconnected". Wi-Fi with no internet: the browser still says online,
 * so the screens took their online path and the send failed (or threw). sendOrQueue keeps such a write on the device; a
 * refusal from the server is still the screen's to show. And a refusal that merely contains "already" is no longer taken
 * for "it landed" and thrown away.
 * Drives the real store (the stand-in IndexedDB from vitest.setup.ts); only the network call is replaced.
 */
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/lazy", () => ({ getClient: async () => ({ rpc: (...a: unknown[]) => rpc(...a), from: () => ({}) }) }));

const { flush, isNetworkError, sendOrQueue, subscribe } = await import("./sync");
const { allJobs, delJob, putJob } = await import("./db");
const clear = async () => { for (const j of await allJobs()) await delJob(j.id); };
let online = true; subscribe((s) => { online = s.online; });

describe("isNetworkError", () => {
  it("knows no answer from a refusal", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);      // Chrome
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);          // Safari, every iPad
    expect(isNetworkError(new Error("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkError(new Error("Not enough in the pantry: Biryani"))).toBe(false);
    expect(isNetworkError(new TypeError("x.map is not a function"))).toBe(false);   // a bug, not the line
  });
});

describe("a refusal that only says 'already'", () => {
  it("is not thrown away as if it had landed", async () => {
    await clear();
    await putJob({ id: crypto.randomUUID(), kind: "place_order", args: { table_id: "t" }, at: Date.now(), tries: 0, label: "Order · T1" });
    rpc.mockResolvedValue({ data: null, error: { message: "The bill for this table is already out — please ask the staff" } });
    await flush();
    expect(await allJobs()).toHaveLength(1);
    await clear();
  });
});

describe("sendOrQueue", () => {
  it("sends when it can, and keeps nothing", async () => {
    const queue = vi.fn(async () => {});
    expect(await sendOrQueue(async () => ({ ok: true }), queue)).toEqual({ ok: true });
    expect(queue).not.toHaveBeenCalled();
  });
  it("hands a refusal back to the screen", async () => {
    const queue = vi.fn(async () => {});
    await expect(sendOrQueue(async () => { throw new Error("permission denied"); }, queue)).rejects.toThrow("permission denied");
    expect(queue).not.toHaveBeenCalled();
    expect(online).toBe(true);
  });
  it("keeps it on the device when the send gets no answer, and goes offline", async () => {
    const queue = vi.fn(async () => {});
    expect(await sendOrQueue(async () => { throw new TypeError("Load failed"); }, queue)).toBeNull();
    expect(queue).toHaveBeenCalledTimes(1);
    expect(online).toBe(false);
  });
  it("once offline, keeps the next one without trying", async () => {
    const send = vi.fn(async () => ({ ok: true })); const queue = vi.fn(async () => {});
    expect(await sendOrQueue(send, queue)).toBeNull();
    expect(send).not.toHaveBeenCalled(); expect(queue).toHaveBeenCalledTimes(1);
  });
});
