import path from "node:path";
import { defineConfig } from "vite";

// The preload runs sandboxed, so it must be one self-contained file that only requires "electron".
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
