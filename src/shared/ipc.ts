/**
 * The contract between the main process, the preload bridge, and the renderer.
 * Every channel is listed here, with its payload types and the validators the main process runs on input.
 */
import type { Library, LinkPreview } from "@/lib/bookmarks";
import type { GithubStats } from "@/lib/github";

export const CHANNELS = {
  bootstrap: "linkbook:bootstrap",
  saveLibrary: "linkbook:library:save",
  setSettings: "linkbook:settings:set",
  fetchPreview: "linkbook:net:preview",
  fetchGithubStats: "linkbook:net:github",
  openImportDialog: "linkbook:dialog:import",
  saveExport: "linkbook:dialog:export",
  /** Main → renderer: a menu item or shortcut was used. */
  menuCommand: "linkbook:menu:command",
} as const;

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DISPLAYS = ["board", "grid", "table", "list"] as const;
export type Display = (typeof DISPLAYS)[number];

export type WindowBounds = { x: number; y: number; width: number; height: number; maximized: boolean };

export type Settings = {
  theme: Theme;
  display: Display;
  window?: WindowBounds;
};

/** The part of the settings the renderer may change. Window bounds belong to the main process. */
export type SettingsPatch = Partial<Pick<Settings, "theme" | "display">>;

export type LibraryRecovery =
  /** The library file was damaged and the last good copy was restored. */
  | { kind: "restored-backup"; damagedCopy: string }
  /** The library and its backup were unreadable; the app starts fresh and keeps the damaged file. */
  | { kind: "reset"; damagedCopy: string };

export type BootstrapData = {
  /** Null on first run, or when the saved library couldn't be read. */
  library: Library | null;
  settings: Settings;
  recovery: LibraryRecovery | null;
  version: string;
  /** Outbound network is off (LINKBOOK_OFFLINE=1), so previews and stats aren't looked up. */
  offline: boolean;
};

export type ErrorCode = "invalid" | "offline" | "not-found" | "rate-limited" | "failed";

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; error: string; resetAt?: string };

export const MENU_COMMANDS = [
  "new-bookmark",
  "import",
  "export",
  "search",
  "view:board",
  "view:grid",
  "view:table",
  "view:list",
  "theme:toggle",
] as const;
export type MenuCommand = (typeof MENU_COMMANDS)[number];

/** What the preload exposes as `window.linkbook`. Nothing else crosses the bridge. */
export type LinkbookApi = {
  bootstrap(): Promise<BootstrapData>;
  saveLibrary(library: Library): Promise<Result<null>>;
  setSettings(patch: SettingsPatch): Promise<Settings>;
  fetchPreview(url: string): Promise<Result<LinkPreview>>;
  fetchGithubStats(repo: string): Promise<Result<GithubStats>>;
  /** Shows the system file picker. The renderer never sees or chooses a path. */
  openImportDialog(): Promise<Result<{ name: string; html: string } | null>>;
  /** Shows the system save dialog and writes the export there. */
  saveExport(html: string, suggestedName: string): Promise<Result<{ path: string } | null>>;
  onMenuCommand(listener: (command: MenuCommand) => void): () => void;
};

// ---- Validators. The main process runs these on everything the renderer sends. ----

export const LIMITS = {
  libraryBytes: 64 * 1024 * 1024,
  importBytes: 32 * 1024 * 1024,
  exportBytes: 64 * 1024 * 1024,
  urlLength: 4096,
  fileName: 120,
};

const isString = (value: unknown, max = Infinity): value is string => typeof value === "string" && value.length <= max;
const isOptionalString = (value: unknown, max = Infinity) => value === undefined || isString(value, max);

export function isHttpUrl(value: unknown): value is string {
  if (!isString(value, LIMITS.urlLength)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** GitHub's rules for owner and repository names. */
export const GITHUB_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export function isSettingsPatch(value: unknown): value is SettingsPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const patch = value as Record<string, unknown>;
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some((key) => key !== "theme" && key !== "display")) return false;
  if ("theme" in patch && !(THEMES as readonly unknown[]).includes(patch.theme)) return false;
  if ("display" in patch && !(DISPLAYS as readonly unknown[]).includes(patch.display)) return false;
  return true;
}

/** Structural check of a whole library, strict enough that a bad write can't corrupt the saved file. */
export function isLibrary(value: unknown): value is Library {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const library = value as Record<string, unknown>;
  if (!Array.isArray(library.categories) || !Array.isArray(library.bookmarks)) return false;
  if (library.imports !== undefined && !(Array.isArray(library.imports) && library.imports.every((id) => isString(id, 200)))) return false;

  for (const item of library.categories) {
    const category = item as Record<string, unknown>;
    if (!category || typeof category !== "object" || !isString(category.id, 300) || !isString(category.name, 500) || !isString(category.color, 50)) return false;
  }
  for (const item of library.bookmarks) {
    const bookmark = item as Record<string, unknown>;
    if (!bookmark || typeof bookmark !== "object") return false;
    if (!isString(bookmark.id, 300) || !isString(bookmark.url, LIMITS.urlLength) || !isString(bookmark.title, 2000) || !isString(bookmark.categoryId, 300)) return false;
    if (!isString(bookmark.createdAt, 64) || !Array.isArray(bookmark.tags) || !bookmark.tags.every((tag) => isString(tag, 200))) return false;
    if (!isOptionalString(bookmark.description, 10_000) || !isOptionalString(bookmark.image, LIMITS.urlLength) || !isOptionalString(bookmark.imageFailedAt, 64)) return false;
  }
  return true;
}
