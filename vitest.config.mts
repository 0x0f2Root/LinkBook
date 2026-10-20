import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests: pure logic from the renderer, the IPC contract, and main-process services. No Electron window.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
