// Must stay first: it may move the userData directory before anything reads it.
import { iconsDir } from "./paths";

import path from "node:path";
import { app, BrowserWindow, dialog, nativeTheme } from "electron";
import { buildMenu } from "./menu";
import { registerIpc } from "./ipc";
import { log } from "./logger";
import { registerSchemes, serveImages, serveRenderer } from "./protocols";
import { APP_ORIGIN, applySecurity, devServerUrl } from "./security";
import { pruneImageCache } from "./services/image-cache";
import { flushStores, getSettings, loadSettings } from "./stores";
import { createMainWindow } from "./window";

let mainWindow: BrowserWindow | null = null;
const getWindow = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);

process.on("uncaughtException", (error) => log("error", "Uncaught exception in the main process", error));
process.on("unhandledRejection", (reason) => log("error", "Unhandled promise rejection in the main process", reason));

// One LinkBook at a time: launching it again from the menu brings the open window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerSchemes();
  app.setAboutPanelOptions({
    applicationName: "LinkBook",
    applicationVersion: app.getVersion(),
    copyright: "Bookmarks saved on this computer.",
    iconPath: path.join(iconsDir, "256x256.png"),
  });

  app.on("second-instance", () => {
    const window = getWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(start, (error) => {
    log("error", "LinkBook couldn't start", error);
    dialog.showErrorBox("LinkBook couldn't start", String(error));
    app.exit(1);
  });

  // Linux and Windows quit with the last window, like other desktop apps.
  app.on("window-all-closed", () => app.quit());

  // Waits for pending saves before quitting, so the last change is never lost. This runs on will-quit,
  // after the window has closed, so the window's final size and position are included.
  let flushed = false;
  app.on("will-quit", (event) => {
    if (flushed) return;
    event.preventDefault();
    flushStores()
      .catch((error) => log("error", "Couldn't finish saving before quitting", error))
      .finally(() => {
        flushed = true;
        app.quit();
      });
  });
}

async function start() {
  const settings = await loadSettings();
  nativeTheme.themeSource = settings.theme;

  const rendererDir = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  const imageCacheDir = path.join(app.getPath("userData"), "image-cache");
  serveRenderer(rendererDir);
  serveImages(imageCacheDir);
  applySecurity();

  const refreshMenu = () => buildMenu(getWindow, getSettings(), nativeTheme.shouldUseDarkColors);
  registerIpc({
    getWindow,
    onSettingsChanged: (next) => {
      nativeTheme.themeSource = next.theme;
      refreshMenu();
    },
  });
  nativeTheme.on("updated", refreshMenu);
  refreshMenu();

  mainWindow = createMainWindow(async (window) => {
    try {
      await window.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`);
    } catch (error) {
      log("error", "The window couldn't load the app", error);
    }
  });
  watchRenderer(mainWindow);
  log("info", `LinkBook ${app.getVersion()} started (${app.isPackaged ? "packaged" : "development"}), data in ${app.getPath("userData")}`);

  void pruneImageCache(imageCacheDir).catch((error) => log("warn", "Couldn't tidy the image cache", error));
}

function watchRenderer(window: BrowserWindow) {
  const contents = window.webContents;

  contents.on("console-message", (event) => {
    if (event.level === "error") log("error", `Renderer: ${event.message}`, { source: event.sourceId, line: event.lineNumber });
  });
  contents.on("preload-error", (_event, preloadPath, error) => log("error", `Preload failed: ${preloadPath}`, error));
  contents.on("did-fail-load", (_event, code, description, url) => log("error", `Failed to load ${url}: ${description} (${code})`));

  contents.on("render-process-gone", async (_event, details) => {
    log("error", "The window's renderer stopped", details);
    if (details.reason === "clean-exit" || window.isDestroyed()) return;
    const { response } = await dialog.showMessageBox(window, {
      type: "error",
      title: "LinkBook stopped working",
      message: "The LinkBook window stopped unexpectedly.",
      detail: "Your bookmarks are saved. Reload to continue.",
      buttons: ["Reload", "Quit"],
      defaultId: 0,
    });
    if (response === 0 && !window.isDestroyed()) contents.reload();
    else app.quit();
  });

  window.on("unresponsive", async () => {
    log("warn", "The window stopped responding");
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      title: "LinkBook isn't responding",
      message: "LinkBook isn't responding.",
      buttons: ["Wait", "Reload"],
      defaultId: 0,
    });
    if (response === 1 && !window.isDestroyed()) contents.reload();
  });
}
