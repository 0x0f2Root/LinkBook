import { useSyncExternalStore } from "react";
import type { SavedGithubStats } from "@/lib/github";
import type { Settings } from "@/shared/ipc";

export type Category = {
  id: string;
  name: string;
  color: string;
};

export type Bookmark = {
  id: string;
  url: string;
  title: string;
  description?: string;
  /** Preview image shown on the card. Without it the card draws a cover from the site's icon. */
  image?: string;
  categoryId: string;
  tags: string[];
  pinned?: boolean;
  unread?: boolean;
  /** Set once the page's preview has been looked up, so a site without one isn't asked again on every visit. */
  previewFetched?: boolean;
  /** When the preview image last failed to load. It isn't requested again for a while, so a dead link stays quiet. */
  imageFailedAt?: string;
  /** Stars, forks, and more when the link points into a GitHub repository. */
  github?: SavedGithubStats;
  /** ISO timestamp. */
  createdAt: string;
};

/** How long a preview image that failed to load is left alone before one more try. */
export const IMAGE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
// Read once per visit, so cards don't call the clock while rendering.
const pageLoadedAt = Date.now();

/** The preview image to show, or undefined when there is none or it failed recently. */
export function usableImage(bookmark: Pick<Bookmark, "image" | "imageFailedAt">) {
  if (!bookmark.image) return undefined;
  if (bookmark.imageFailedAt && pageLoadedAt - Date.parse(bookmark.imageFailedAt) < IMAGE_RETRY_MS) return undefined;
  return bookmark.image;
}

export type LinkPreview = { title?: string; description?: string; image?: string };

const previewRequests = new Map<string, Promise<LinkPreview | null>>();
// After a big import, hundreds of bookmarks need a preview. A few at a time keeps the server and the sites calm.
const MAX_PREVIEW_REQUESTS = 4;
let activePreviewRequests = 0;
const waitingPreviewRequests: (() => void)[] = [];

async function withPreviewSlot<T>(task: () => Promise<T>) {
  if (activePreviewRequests >= MAX_PREVIEW_REQUESTS) await new Promise<void>((resolve) => waitingPreviewRequests.push(resolve));
  activePreviewRequests += 1;
  try {
    return await task();
  } finally {
    activePreviewRequests -= 1;
    waitingPreviewRequests.shift()?.();
  }
}

/** Title, description, and preview image read from the page's meta tags. Null when the page can't be read. */
export function fetchPreview(url: string, { priority = false } = {}) {
  let request = previewRequests.get(url);
  if (!request) {
    // The main process fetches the page (with its private-network guard), so the window itself never contacts a site.
    const load = () => window.linkbook.fetchPreview(url).then((result) => (result.ok ? result.value : null), () => null);
    // A link pasted into the form skips the queue, so it never waits behind an import.
    request = priority ? load() : withPreviewSlot(load);
    previewRequests.set(url, request);
  }
  return request;
}

export type Library = {
  categories: Category[];
  /** Array order is the manual order inside each column. */
  bookmarks: Bookmark[];
  /** Collections added by earlier versions of LinkBook. Kept so libraries saved by them still load. */
  imports?: string[];
};

export const CATEGORY_COLORS = ["#60a5fa", "#f472b6", "#facc15", "#34d399", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171"];

/** What a first run starts with: no bookmarks, and one category so New bookmark has somewhere to put them. */
export const EMPTY_LIBRARY: Library = {
  categories: [{ id: "unsorted", name: "Unsorted", color: CATEGORY_COLORS[0] }],
  bookmarks: [],
};

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The site's icon, fetched and cached on disk by the main process. */
export function faviconUrl(url: string) {
  return `lbimg://favicon/?domain=${encodeURIComponent(hostname(url))}`;
}

/** Card widths the main process resizes to. Each is a size it accepts. */
export type ImageWidth = 64 | 128 | 320 | 400 | 640 | 828 | 1080;

/** A remote image through the main process, which shrinks it to `width` and keeps it for offline use. */
export function imageSrc(src: string, width: ImageWidth) {
  return `lbimg://image/?src=${encodeURIComponent(src)}&w=${width}`;
}

/** Lowercase, trimmed, deduplicated tags from a comma-separated string. */
export function parseTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))];
}

export function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

export function uniqueId(base: string, taken: { id: string }[]) {
  const ids = new Set(taken.map((item) => item.id));
  const slug = slugify(base);
  if (!ids.has(slug)) return slug;
  let n = 2;
  while (ids.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

// The library is saved by the main process, in a JSON file in the app's data folder. The window keeps a
// copy in memory, so reads stay synchronous, and sends every change back to be written atomically.
const listeners = new Set<() => void>();
const saveErrorListeners = new Set<(message: string) => void>();
let cached: Library = EMPTY_LIBRARY;
let offline = false;

/** Called once at startup with what the main process loaded. Null means a first run, which starts empty. */
export function initLibrary(library: Library | null, { offline: isOffline = false } = {}) {
  cached = library ?? EMPTY_LIBRARY;
  offline = isOffline;
}

/** True when the app was started with LINKBOOK_OFFLINE=1, so nothing is looked up online. */
export const isOffline = () => offline;

const readLibrary = () => cached;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setLibrary(update: Library | ((current: Library) => Library)) {
  cached = typeof update === "function" ? update(cached) : update;
  listeners.forEach((listener) => listener());
  const report = (message: string) => saveErrorListeners.forEach((listener) => listener(message));
  window.linkbook.saveLibrary(cached).then(
    (result) => !result.ok && report(result.error),
    () => report("Couldn't save your bookmarks"),
  );
}

/** Called when a change couldn't be written to disk, so the board can say so. */
export function onSaveError(listener: (message: string) => void) {
  saveErrorListeners.add(listener);
  return () => {
    saveErrorListeners.delete(listener);
  };
}

export function useLibrary() {
  return useSyncExternalStore(subscribe, readLibrary, readLibrary);
}

const noopSubscribe = () => () => {};

/** False only while a server render would be hydrating. The desktop app renders on the client, so this is true. */
export function useHydrated() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** Moves a bookmark into a category, before another bookmark or at the end of the column. */
export function moveBookmark(library: Library, id: string, categoryId: string, beforeId: string | null): Library {
  const moving = library.bookmarks.find((bookmark) => bookmark.id === id);
  if (!moving || id === beforeId) return library;
  const rest = library.bookmarks.filter((bookmark) => bookmark.id !== id);
  const moved = { ...moving, categoryId };
  let index = beforeId ? rest.findIndex((bookmark) => bookmark.id === beforeId) : -1;
  if (index === -1) {
    // After the last bookmark of the target column, so the column order is kept.
    const lastInColumn = rest.findLastIndex((bookmark) => bookmark.categoryId === categoryId);
    index = lastInColumn === -1 ? rest.length : lastInColumn + 1;
  }
  return { ...library, bookmarks: [...rest.slice(0, index), moved, ...rest.slice(index)] };
}

// Theme and view are settings kept by the main process, which also shows them in the View menu.
let settings: Pick<Settings, "theme" | "display"> = { theme: "system", display: "board" };
const settingsListeners = new Set<() => void>();

export function initSettings(next: Pick<Settings, "theme" | "display">) {
  settings = { theme: next.theme, display: next.display };
}

function subscribeSettings(listener: () => void) {
  settingsListeners.add(listener);
  return () => {
    settingsListeners.delete(listener);
  };
}

export function useSetting<K extends keyof typeof settings>(key: K) {
  const read = () => settings[key];
  const value = useSyncExternalStore(subscribeSettings, read, read);
  const setValue = (next: (typeof settings)[K]) => {
    settings = { ...settings, [key]: next };
    settingsListeners.forEach((listener) => listener());
    void window.linkbook.setSettings({ [key]: next });
  };
  return [value, setValue] as const;
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)");

function subscribeSystemTheme(listener: () => void) {
  const media = systemDark();
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

/** Dark when chosen, or when following a dark system theme. Choosing sets it explicitly. */
export function useDarkMode() {
  const [theme, setTheme] = useSetting("theme");
  const prefersDark = useSyncExternalStore(subscribeSystemTheme, () => systemDark().matches, () => false);
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  return [isDark, (dark: boolean) => setTheme(dark ? "dark" : "light")] as const;
}
