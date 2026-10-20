import { readFile } from "node:fs/promises";
import path from "node:path";
import { protocol } from "electron";
import { log } from "./logger";
import { PRODUCTION_CSP } from "./security";
import { createImageHandler } from "./services/image-cache";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Must run before the app is ready. `app:` behaves like https (secure, standard origin) for the UI. */
export function registerSchemes() {
  protocol.registerSchemesAsPrivileged([
    { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: "lbimg", privileges: { standard: true, secure: true } },
  ]);
}

/** Serves app://linkbook/<path> from the built renderer folder and nothing outside it. */
export function serveRenderer(rendererDir: string) {
  const root = path.resolve(rendererDir);
  protocol.handle("app", async (request) => {
    const url = new URL(request.url);
    if (url.host !== "linkbook") return new Response(null, { status: 404 });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) {
      log("warn", "Blocked a request outside the app folder", pathname.slice(0, 200));
      return new Response(null, { status: 403 });
    }
    try {
      const body = await readFile(file);
      return new Response(body, {
        headers: {
          "content-type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
          "content-security-policy": PRODUCTION_CSP,
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

export function serveImages(cacheDir: string) {
  protocol.handle("lbimg", createImageHandler(cacheDir));
}
