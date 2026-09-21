/** The outbox is browser code: it wants IndexedDB, a crypto.randomUUID and a navigator that knows
 *  whether it is online. None of that exists in Node, so it is supplied here. */
import "fake-indexeddb/auto";

if (!globalThis.crypto?.randomUUID) {
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, writable: true, configurable: true });
Object.defineProperty(globalThis, "window", {
  value: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  writable: true, configurable: true,
});
Object.defineProperty(globalThis, "document", {
  value: { addEventListener() {}, removeEventListener() {}, hidden: false, visibilityState: "visible" },
  writable: true, configurable: true,
});
class Ev { type: string; detail: unknown; constructor(t: string, i?: { detail?: unknown }) { this.type = t; this.detail = i?.detail; } }
Object.defineProperty(globalThis, "CustomEvent", { value: Ev, writable: true, configurable: true });
