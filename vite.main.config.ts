import path from "node:path";
import { defineConfig } from "vite";

// Forge merges this over its main-process defaults (CommonJS output in .vite/build, Node built-ins external).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
