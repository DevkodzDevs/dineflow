import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { msStore } from "./installers";

describe("installers — the Microsoft Store listing (2026-11-26)", () => {
  it("takes a 12-character Store product id, any case, and points at the Store's page", () => {
    expect(msStore("9nblggh4r315")).toEqual({ url: "https://apps.microsoft.com/detail/9nblggh4r315", size: null, version: null, file: "9NBLGGH4R315" });
    expect(msStore(" 9NBLGGH4R315 ")?.file).toBe("9NBLGGH4R315");
  });
  it("ignores anything else, so a typo never sends a PC somewhere else", () => {
    for (const bad of [undefined, "", "9NBLGGH4R31", "9NBLGGH4R3155", "https://evil.example/9NBLGGH4R315", "9NBLGGH4R31!"]) expect(msStore(bad)).toBeNull();
  });
});
