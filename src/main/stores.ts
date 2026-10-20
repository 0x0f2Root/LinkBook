import { app } from "electron";
import type { Library } from "@/lib/bookmarks";
import { DISPLAYS, THEMES, isLibrary, type Settings, type WindowBounds } from "@/shared/ipc";
import { JsonStore } from "./services/json-store";

const DEFAULT_SETTINGS: Settings = { theme: "system", display: "board" };

function isWindowBounds(value: unknown): value is WindowBounds {
  const bounds = value as WindowBounds;
  return (
    !!bounds &&
    [bounds.x, bounds.y, bounds.width, bounds.height].every((n) => Number.isFinite(n) && Math.abs(n) < 100_000) &&
    typeof bounds.maximized === "boolean"
  );
}

function isSettings(value: unknown): value is Settings {
  const settings = value as Settings;
  return (
    !!settings &&
    (THEMES as readonly unknown[]).includes(settings.theme) &&
    (DISPLAYS as readonly unknown[]).includes(settings.display) &&
    (settings.window === undefined || isWindowBounds(settings.window))
  );
}

/** Files live in Electron's userData directory, e.g. ~/.config/LinkBook on Linux. */
export const libraryStore = new JsonStore<Library>(app.getPath("userData"), "library.json", isLibrary);
const settingsStore = new JsonStore<Settings>(app.getPath("userData"), "settings.json", isSettings);

let settings: Settings = DEFAULT_SETTINGS;

export async function loadSettings() {
  const result = await settingsStore.load();
  // Settings are easy to recreate, so a damaged file just falls back to the defaults.
  settings = result.status === "ok" || result.status === "restored-backup" ? { ...DEFAULT_SETTINGS, ...result.value } : DEFAULT_SETTINGS;
  return settings;
}

export const getSettings = () => settings;

export function updateSettings(patch: Partial<Settings>) {
  settings = { ...settings, ...patch };
  void settingsStore.save(settings);
  return settings;
}

export const flushStores = () => Promise.all([libraryStore.flush(), settingsStore.flush()]);
