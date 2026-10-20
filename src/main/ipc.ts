import { stat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { Library } from "@/lib/bookmarks";
import {
  CHANNELS,
  GITHUB_REPO,
  LIMITS,
  isHttpUrl,
  isLibrary,
  isSettingsPatch,
  type BootstrapData,
  type LibraryRecovery,
  type Result,
  type Settings,
  type SettingsPatch,
} from "@/shared/ipc";
import { log } from "./logger";
import { isTrustedSender } from "./security";
import { fetchGithubStats } from "./services/github";
import { offline } from "./services/net-guard";
import { fetchLinkPreview } from "./services/preview";
import { getSettings, libraryStore, updateSettings } from "./stores";

const invalid = (error: string) => ({ ok: false as const, code: "invalid" as const, error });

/** Window bounds stay in the main process; the renderer only sees the theme and the view. */
const publicSettings = ({ theme, display }: Settings): Settings => ({ theme, display });

/** Registers a handler that only answers the app's own page and turns unexpected errors into a plain result. */
function handle<Args extends unknown[], R>(channel: string, handler: (event: IpcMainInvokeEvent, ...args: Args) => Promise<R> | R) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event)) {
      log("warn", `Refused ${channel} from an untrusted frame`, event.senderFrame?.url?.slice(0, 200));
      throw new Error("Not allowed");
    }
    return handler(event, ...(args as Args));
  });
}

export function registerIpc({ getWindow, onSettingsChanged }: { getWindow: () => BrowserWindow | null; onSettingsChanged: (settings: Settings) => void }) {
  // The first load reports a recovered library once; later loads (a reload of the window) don't repeat it.
  let pendingRecovery: LibraryRecovery | null = null;
  let firstLoad = true;

  handle(CHANNELS.bootstrap, async (): Promise<BootstrapData> => {
    await libraryStore.flush();
    const result = await libraryStore.load();
    if (firstLoad && (result.status === "restored-backup" || result.status === "reset")) {
      pendingRecovery = { kind: result.status, damagedCopy: result.damagedCopy };
      log("warn", `Library file was damaged (${result.status}); damaged copy kept at ${result.damagedCopy}`);
    }
    firstLoad = false;
    const recovery = pendingRecovery;
    pendingRecovery = null;
    return {
      library: result.status === "ok" || result.status === "restored-backup" ? result.value : null,
      settings: publicSettings(getSettings()),
      recovery,
      version: app.getVersion(),
      offline,
    };
  });

  handle(CHANNELS.saveLibrary, async (_event, library: unknown): Promise<Result<null>> => {
    if (!isLibrary(library)) return invalid("That isn't a valid library");
    // Measured as the JSON that will be written, so the limit matches the file size.
    if (JSON.stringify(library).length > LIMITS.libraryBytes) return invalid("The library is too large to save");
    try {
      await libraryStore.save(library as Library);
      return { ok: true, value: null };
    } catch (error) {
      log("error", "Couldn't save the library", error);
      return { ok: false, code: "failed", error: "Couldn't save your bookmarks to disk" };
    }
  });

  handle(CHANNELS.setSettings, (_event, patch: unknown): Settings => {
    if (!isSettingsPatch(patch)) throw new Error("Invalid settings");
    const next = updateSettings(patch as SettingsPatch);
    onSettingsChanged(next);
    return publicSettings(next);
  });

  handle(CHANNELS.fetchPreview, (_event, url: unknown) => (isHttpUrl(url) ? fetchLinkPreview(url) : invalid("Only http and https links have previews")));

  handle(CHANNELS.fetchGithubStats, (_event, repo: unknown) =>
    typeof repo === "string" && GITHUB_REPO.test(repo) ? fetchGithubStats(repo) : invalid("Pass a repository as owner/name"),
  );

  handle(CHANNELS.openImportDialog, async (): Promise<Result<{ name: string; html: string } | null>> => {
    const window = getWindow();
    const options = {
      title: "Import Bookmarks",
      buttonLabel: "Import",
      properties: ["openFile" as const],
      filters: [
        { name: "Bookmarks export (HTML)", extensions: ["html", "htm"] },
        { name: "All files", extensions: ["*"] },
      ],
    };
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || picked.filePaths.length === 0) return { ok: true, value: null };
    const file = picked.filePaths[0];
    try {
      const info = await stat(file);
      if (!info.isFile()) return invalid("That isn't a file");
      if (info.size > LIMITS.importBytes) return invalid("That file is larger than 32 MB");
      return { ok: true, value: { name: path.basename(file), html: await readFile(file, "utf8") } };
    } catch (error) {
      log("error", "Couldn't read the import file", error);
      return { ok: false, code: "failed", error: "Couldn't read that file" };
    }
  });

  handle(CHANNELS.saveExport, async (_event, html: unknown, suggestedName: unknown): Promise<Result<{ path: string } | null>> => {
    if (typeof html !== "string" || html.length > LIMITS.exportBytes) return invalid("Nothing to export");
    // The renderer only suggests a file name; the user picks the folder in the system dialog.
    const name =
      typeof suggestedName === "string" && /^[\w .()-]{1,120}\.html?$/.test(suggestedName) ? suggestedName : "linkbook-bookmarks.html";
    const window = getWindow();
    const options = {
      title: "Export Bookmarks",
      buttonLabel: "Export",
      defaultPath: path.join(app.getPath("documents"), name),
      filters: [{ name: "Bookmarks export (HTML)", extensions: ["html"] }],
    };
    const picked = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { ok: true, value: null };
    try {
      await writeFile(picked.filePath, html, "utf8");
      return { ok: true, value: { path: picked.filePath } };
    } catch (error) {
      log("error", "Couldn't write the export", error);
      return { ok: false, code: "failed", error: "Couldn't write the file there" };
    }
  });
}
