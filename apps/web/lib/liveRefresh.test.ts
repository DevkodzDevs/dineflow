import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* Node has no window or document: a stand-in with the two things lib/liveRefresh.ts reads — fetch (to count server
   actions) and visibilityState. The fetch answers when the test says so. */
let answer: (() => void) | null = null;
const g = globalThis as unknown as { window: { fetch: typeof fetch }; document: { visibilityState: string } };
beforeAll(() => {
  vi.useFakeTimers();
  g.document = { visibilityState: "visible" };
  g.window = { fetch: (() => new Promise<Response>((res) => { answer = () => res(new Response("ok")); })) as typeof fetch };
});
afterAll(() => { vi.useRealTimers(); });

describe("a live screen's refresh", () => {
  it("makes one refresh of a burst, and keeps refreshes apart", async () => {
    const { calmRefresher } = await import("./liveRefresh");
    const refresh = vi.fn(); const r = calmRefresher(refresh, 2000);
    r.bump(); r.bump(); r.bump();
    await vi.advanceTimersByTimeAsync(399); expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(refresh).toHaveBeenCalledTimes(1);
    r.bump(); await vi.advanceTimersByTimeAsync(1000); expect(refresh).toHaveBeenCalledTimes(1);   // under the 2 s floor
    await vi.advanceTimersByTimeAsync(1000); expect(refresh).toHaveBeenCalledTimes(2);
    r.stop();
  });
  it("never refreshes over the answer of an action this screen sent, and runs once it has landed", async () => {
    const { calmRefresher, actionBusy } = await import("./liveRefresh");
    const refresh = vi.fn(); const r = calmRefresher(refresh, 400);
    void g.window.fetch("/kitchen", { method: "POST", headers: { "next-action": "abc" } });
    expect(actionBusy()).toBe(true);
    r.bump(); await vi.advanceTimersByTimeAsync(3000); expect(refresh).not.toHaveBeenCalled();   // still answering
    answer!(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); expect(refresh).not.toHaveBeenCalled();   // the answer is the refresh
    await vi.advanceTimersByTimeAsync(800); expect(refresh).toHaveBeenCalledTimes(1);   // then a change from elsewhere still shows
    expect(actionBusy()).toBe(false);
    r.stop();
  });
  it("leaves ordinary requests alone, and does nothing while the tab is hidden", async () => {
    const { calmRefresher, actionBusy } = await import("./liveRefresh");
    await vi.advanceTimersByTimeAsync(2000);
    void g.window.fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" } });
    expect(actionBusy()).toBe(false);
    answer!();
    g.document.visibilityState = "hidden";
    const refresh = vi.fn(); const r = calmRefresher(refresh, 400);
    r.bump(); await vi.advanceTimersByTimeAsync(2000); expect(refresh).not.toHaveBeenCalled();
    g.document.visibilityState = "visible"; r.now(); expect(refresh).toHaveBeenCalledTimes(1);
    r.stop();
  });
});
