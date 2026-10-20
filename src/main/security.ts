import { app, session, shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import { log } from "./logger";

export const APP_ORIGIN = "app://linkbook";
export const devServerUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === "string" && MAIN_WINDOW_VITE_DEV_SERVER_URL ? MAIN_WINDOW_VITE_DEV_SERVER_URL : null;
const devOrigin = devServerUrl ? new URL(devServerUrl).origin : null;

const shared = [
  "default-src 'none'",
  // Inline style attributes come from React and the UI library; scripts stay strictly same-origin.
  "style-src 'self' 'unsafe-inline'",
  // Every remote image goes through the main process (lbimg:), so the page itself never contacts a site.
  "img-src 'self' data: blob: lbimg:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
];

/** Production: no inline or remote scripts, and the page can only fetch its own files. */
export const PRODUCTION_CSP = [...shared, "script-src 'self'", "connect-src 'self'"].join("; ");

/** Development adds what Vite needs: its inline React Refresh preamble and the hot-reload socket. */
const DEVELOPMENT_CSP = devOrigin
  ? [...shared, "script-src 'self' 'unsafe-inline'", `connect-src 'self' ${devOrigin} ${devOrigin.replace(/^http/, "ws")}`].join("; ")
  : PRODUCTION_CSP;

export function isAppUrl(url: string) {
  try {
    const parsed = new URL(url);
    // Node's URL reports the origin of a custom scheme as "null", so app: is matched by protocol and host.
    if (parsed.protocol === "app:") return parsed.host === "linkbook";
    return devOrigin !== null && parsed.origin === devOrigin;
  } catch {
    return false;
  }
}

/** IPC is only answered for the app's own top-level page, never for anything it might embed. */
export function isTrustedSender(event: IpcMainInvokeEvent) {
  const frame = event.senderFrame;
  return !!frame && frame.parent === null && isAppUrl(frame.url);
}

const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function openExternal(url: string) {
  try {
    if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) void shell.openExternal(url);
    else log("warn", "Blocked opening a link with an unsupported protocol", url.slice(0, 200));
  } catch {
    log("warn", "Blocked opening an invalid link");
  }
}

function hardenContents(contents: WebContents) {
  // Bookmarks open in the system browser; the app window only ever shows the app.
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    // A dropped link or a plain <a> without target lands here; open it outside instead.
    if (/^https?:/i.test(url)) openExternal(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

export function applySecurity() {
  app.on("web-contents-created", (_event, contents) => hardenContents(contents));

  // Copy link uses the clipboard; every other permission (camera, location, notifications from the page...) is refused.
  const allowed = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));

  // In development the page comes from Vite's server, so the policy is added to its responses here.
  if (devOrigin) {
    session.defaultSession.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [DEVELOPMENT_CSP] } });
    });
  }
}
