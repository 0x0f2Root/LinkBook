import path from "node:path";
import { defineConfig } from "vitest/config";

// End-to-end tests launch the packaged app (run `pnpm package` first) and drive it over the DevTools protocol.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // One app window at a time.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
