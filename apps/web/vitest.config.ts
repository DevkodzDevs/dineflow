import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/** Unit tests run in Node with a stand-in IndexedDB, so the outbox can be exercised without a browser. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
});
