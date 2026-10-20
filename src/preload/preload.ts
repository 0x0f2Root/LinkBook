// Runs sandboxed with context isolation. The page gets exactly these functions as `window.linkbook`;
// it never sees ipcRenderer, Node, or Electron itself.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { CHANNELS, MENU_COMMANDS, type LinkbookApi, type MenuCommand } from "@/shared/ipc";

const api: LinkbookApi = {
  bootstrap: () => ipcRenderer.invoke(CHANNELS.bootstrap),
  saveLibrary: (library) => ipcRenderer.invoke(CHANNELS.saveLibrary, library),
  setSettings: (patch) => ipcRenderer.invoke(CHANNELS.setSettings, patch),
  fetchPreview: (url) => ipcRenderer.invoke(CHANNELS.fetchPreview, url),
  fetchGithubStats: (repo) => ipcRenderer.invoke(CHANNELS.fetchGithubStats, repo),
  openImportDialog: () => ipcRenderer.invoke(CHANNELS.openImportDialog),
  saveExport: (html, suggestedName) => ipcRenderer.invoke(CHANNELS.saveExport, html, suggestedName),
  onMenuCommand: (listener) => {
    const forward = (_event: IpcRendererEvent, command: unknown) => {
      if ((MENU_COMMANDS as readonly unknown[]).includes(command)) listener(command as MenuCommand);
    };
    ipcRenderer.on(CHANNELS.menuCommand, forward);
    return () => {
      ipcRenderer.removeListener(CHANNELS.menuCommand, forward);
    };
  },
};

contextBridge.exposeInMainWorld("linkbook", api);
