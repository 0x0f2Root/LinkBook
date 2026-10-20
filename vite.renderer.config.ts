import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // Same as the Next.js setup: only files marked "use memo" (the board, cards, and views) are compiled.
    babel({ presets: [reactCompilerPreset({ compilationMode: "annotation" })] }),
    tailwindcss(),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Loaded from app://linkbook/ in production, so asset URLs are relative to the page.
  base: "./",
  build: {
    target: "chrome140",
    // The window loads its files from disk, so one larger chunk costs nothing and avoids a request waterfall.
    chunkSizeWarningLimit: 1500,
  },
});
