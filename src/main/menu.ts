import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { CHANNELS, type Display, type MenuCommand, type Settings } from "@/shared/ipc";

const VIEWS: { display: Display; label: string; accelerator: string }[] = [
  { display: "board", label: "Board", accelerator: "CmdOrCtrl+1" },
  { display: "grid", label: "Grid", accelerator: "CmdOrCtrl+2" },
  { display: "table", label: "Table", accelerator: "CmdOrCtrl+3" },
  { display: "list", label: "List", accelerator: "CmdOrCtrl+4" },
];

/** Rebuilt whenever the view or theme changes, so the radio and checkbox items match the app. */
export function buildMenu(getWindow: () => BrowserWindow | null, settings: Settings, isDark: boolean) {
  const send = (command: MenuCommand) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(CHANNELS.menuCommand, command);
  };
  const isDevelopment = !app.isPackaged;

  const template: MenuItemConstructorOptions[] = [
    {
      label: "&File",
      submenu: [
        { label: "&New Bookmark…", accelerator: "CmdOrCtrl+N", click: () => send("new-bookmark") },
        { type: "separator" },
        { label: "&Import Bookmarks…", accelerator: "CmdOrCtrl+O", click: () => send("import") },
        { label: "&Export Bookmarks…", accelerator: "CmdOrCtrl+Shift+E", click: () => send("export") },
        { type: "separator" },
        { role: "quit", accelerator: "CmdOrCtrl+Q" },
      ],
    },
    {
      label: "&Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "&Find…", accelerator: "CmdOrCtrl+F", click: () => send("search") },
      ],
    },
    {
      label: "&View",
      submenu: [
        ...VIEWS.map(({ display, label, accelerator }): MenuItemConstructorOptions => ({
          label,
          accelerator,
          type: "radio",
          checked: settings.display === display,
          click: () => send(`view:${display}`),
        })),
        { type: "separator" },
        { label: "&Dark Theme", type: "checkbox", checked: isDark, accelerator: "CmdOrCtrl+Shift+L", click: () => send("theme:toggle") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDevelopment ? ([{ type: "separator" }, { role: "reload" }, { role: "toggleDevTools" }] as MenuItemConstructorOptions[]) : []),
      ],
    },
    { label: "&Window", submenu: [{ role: "minimize" }, { role: "zoom", label: "Maximize" }, { role: "close" }] },
    { label: "&Help", submenu: [{ label: "&About LinkBook", click: () => app.showAboutPanel() }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
