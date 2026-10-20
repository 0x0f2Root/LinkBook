import path from "node:path";
import { app, BrowserWindow, nativeTheme, screen, type Rectangle } from "electron";
import type { WindowBounds } from "@/shared/ipc";
import { iconsDir } from "./paths";
import { getSettings, updateSettings } from "./stores";

const DEFAULT_SIZE = { width: 1320, height: 860 };
const MIN_SIZE = { width: 720, height: 520 };

/** True when at least a usable part of the window (title bar included) lands on a connected display. */
function isVisible(bounds: Rectangle) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const overlapY = Math.min(bounds.y + 40, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return overlapX >= 120 && overlapY >= 20;
  });
}

/** The saved position if it still fits a connected display, otherwise a centered window that fits the primary one. */
function initialBounds(saved: WindowBounds | undefined): Partial<Rectangle> {
  if (saved && saved.width >= MIN_SIZE.width && saved.height >= MIN_SIZE.height && isVisible(saved)) {
    return { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
  }
  const { workAreaSize } = screen.getPrimaryDisplay();
  return { width: Math.min(DEFAULT_SIZE.width, workAreaSize.width), height: Math.min(DEFAULT_SIZE.height, workAreaSize.height) };
}

export function createMainWindow(load: (window: BrowserWindow) => Promise<void>) {
  const saved = getSettings().window;
  const window = new BrowserWindow({
    ...initialBounds(saved),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: "LinkBook",
    icon: path.join(iconsDir, "512x512.png"),
    // Matches the app background, so there's no white flash before the first paint.
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#161616" : "#ffffff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      devTools: !app.isPackaged || process.env.LINKBOOK_DEVTOOLS === "1",
    },
  });

  window.once("ready-to-show", () => {
    if (saved?.maximized) window.maximize();
    window.show();
  });

  // Window bounds are saved when they settle, not on every pixel of a drag.
  let timer: NodeJS.Timeout | undefined;
  const remember = () => {
    if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
    const bounds = window.getNormalBounds();
    updateSettings({ window: { ...bounds, maximized: window.isMaximized() } });
  };
  const rememberSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(remember, 400);
  };
  window.on("resize", rememberSoon);
  window.on("move", rememberSoon);
  window.on("maximize", remember);
  window.on("unmaximize", remember);
  window.on("close", () => {
    clearTimeout(timer);
    remember();
  });

  void load(window);
  return window;
}
