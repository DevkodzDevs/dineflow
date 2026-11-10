import { describe, it, expect } from "vitest";
import { readFeed, viaRoute, paceFor, IDLE_MS, DIRECT_REST_MS, type FeedEnv } from "./screenFeed";

/** How a TV reads its feed: the database's API first, the app's route as the fallback, slower when the board is empty. */
const KEY = "0123456789abcdef0123";
const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const env = (answers: { direct?: () => Response; route?: () => Response }, at = 1000) => {
  const calls: string[] = []; const e = { t: at };
  const f: FeedEnv = {
    url: "https://db.example/", key: "anon", now: () => e.t, state: { directOffUntil: 0 },
    fetch: (async (u: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${u}`);
      const a = answers[u.startsWith("https://db.example") ? "direct" : "route"];
      if (!a) throw new Error("offline");
      return a();
    }) as never,
  };
  return { f, calls, e };
};

describe("a TV's feed", () => {
  it("asks the database's API, and never the app's server when that answers", async () => {
    const { f, calls } = env({ direct: () => res(200, { name: "A" }), route: () => res(200, { name: "route" }) });
    expect(await readFeed("screen_queue", KEY, "/api/screen/x/queue", f)).toEqual({ ok: true, feed: { name: "A" } });
    expect(calls).toEqual(["POST https://db.example/rest/v1/rpc/screen_queue"]);
  });
  it("a null answer is a wrong or rotated key — gone, and the route is not asked the same question", async () => {
    const { f, calls } = env({ direct: () => res(200, null), route: () => res(200, { name: "route" }) });
    expect(await readFeed("screen_feed", KEY, "/api/screen/x", f)).toEqual({ ok: false, gone: true });
    expect(calls).toHaveLength(1);
  });
  it("falls back to the route when the direct call fails, then leaves the direct call alone for five minutes", async () => {
    const { f, calls, e } = env({ direct: () => res(404, { code: "PGRST202" }), route: () => res(200, { name: "route" }) });
    expect(await readFeed("screen_queue", KEY, "/r", f)).toEqual({ ok: true, feed: { name: "route" } });
    expect(await readFeed("screen_queue", KEY, "/r", f)).toEqual({ ok: true, feed: { name: "route" } });
    expect(calls).toEqual(["POST https://db.example/rest/v1/rpc/screen_queue", "GET /r", "GET /r"]);
    e.t += DIRECT_REST_MS;
    await readFeed("screen_queue", KEY, "/r", f);
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(2);
  });
  it("a thrown fetch (blocked address, no network) falls back too; both down is unreachable, not gone", async () => {
    const { f } = env({});
    expect(await readFeed("screen_feed", KEY, "/r", f)).toEqual({ ok: false, gone: false });
  });
  it("without the database's address it uses the route; a bad key asks nobody", async () => {
    const a = env({ route: () => res(200, { name: "route" }) }); a.f.url = undefined;
    expect(await readFeed("screen_feed", KEY, "/r", a.f)).toEqual({ ok: true, feed: { name: "route" } });
    const b = env({ direct: () => res(200, { name: "A" }) });
    expect(await readFeed("screen_feed", "../etc", "/r", b.f)).toEqual({ ok: false, gone: true });
    expect(b.calls).toHaveLength(0);
  });
  it("the route says gone on 404 and unreachable on 503", async () => {
    expect(await viaRoute("/r", env({ route: () => res(404, null) }).f)).toEqual({ ok: false, gone: true });
    expect(await viaRoute("/r", env({ route: () => res(503, { error: "unavailable" }) }).f)).toEqual({ ok: false, gone: false });
  });
  it("keeps its own pace while something is on the board, 15 s while it is empty", () => {
    expect(paceFor(true, 4000)).toBe(4000);
    expect(paceFor(false, 4000)).toBe(IDLE_MS);
    expect(paceFor(false, 8000)).toBe(IDLE_MS);
    expect(paceFor(false, 30000)).toBe(30000);
  });
});
