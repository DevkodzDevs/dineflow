import { describe, it, expect } from "vitest";
import { keepFor } from "./keepFor";

/** The public menu's short keep: one read for visits that come together, never older than its limit. */
describe("keepFor", () => {
  it("reads once for visits inside the limit, again after it", async () => {
    let t = 0, reads = 0; const keep = keepFor<number>(30000, 200, () => t);
    const read = async () => ++reads;
    expect(await keep("a", read)).toBe(1);
    t = 29999; expect(await keep("a", read)).toBe(1);
    t = 30000; expect(await keep("a", read)).toBe(2);
    expect(reads).toBe(2);
  });
  it("visits that arrive together share one read", async () => {
    let reads = 0; const keep = keepFor<number>(30000);
    const read = () => new Promise<number>((r) => setTimeout(() => r(++reads), 5));
    expect(await Promise.all([keep("a", read), keep("a", read), keep("a", read)])).toEqual([1, 1, 1]);
  });
  it("each key has its own answer", async () => {
    const keep = keepFor<string>(30000);
    expect(await keep("a", async () => "A")).toBe("A");
    expect(await keep("b", async () => "B")).toBe("B");
    expect(await keep("a", async () => "again")).toBe("A");
  });
  it("an answer that should not be kept is asked again next time", async () => {
    let reads = 0; const keep = keepFor<string | null>(30000);
    const read = async () => (++reads === 1 ? null : "open");
    expect(await keep("a", read, (v) => v !== null)).toBeNull();
    expect(await keep("a", read, (v) => v !== null)).toBe("open");
    expect(await keep("a", read, (v) => v !== null)).toBe("open");
    expect(reads).toBe(2);
  });
  it("a failed read is not kept either", async () => {
    let reads = 0; const keep = keepFor<string>(30000);
    const read = async () => { if (++reads === 1) throw new Error("down"); return "up"; };
    await expect(keep("a", read)).rejects.toThrow("down");
    expect(await keep("a", read)).toBe("up");
  });
  it("holds at most its limit of keys, dropping the oldest", async () => {
    let reads = 0; const keep = keepFor<number>(30000, 2);
    const read = async () => ++reads;
    await keep("a", read); await keep("b", read); await keep("c", read);
    expect(await keep("c", read)).toBe(3);
    expect(await keep("a", read)).toBe(4);
  });
});
