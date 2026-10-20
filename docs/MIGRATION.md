# LinkBook: Next.js → Electron migration report

Status: **done** (2026-10-20). LinkBook runs as an Electron desktop app built with Vite and packaged with Electron Forge as a Debian package. Next.js is no longer used by the app; see [Remaining limitations](#7-remaining-limitations) for the one dev-only leftover.

A full backup of the Next.js source taken before any change is in `.migration-backup/linkbook-nextjs-2026-10-20.tar.gz` (the project isn't a git repository).

## 1. Audit of the Next.js app

| Area | Found |
|---|---|
| Router | App Router, one route `/` (`src/app/page.tsx`) rendering the client component `LinkbookBoard`. No other pages, dynamic routes, or deep links. |
| Server code | Two API routes: `/api/preview` (reads a page's meta tags server-side, checks the preview image, private-network guard) and `/api/github` (GitHub REST stats, in-memory cache, rate-limit back-off, optional `GITHUB_TOKEN`). |
| Not used | Server Components with data, Server Actions, middleware, auth, database, cookies, i18n. |
| Next.js APIs in client code | `next/image` with the image optimizer (card cover, table thumbnail, sidebar logo); `next/font` (Geist, but `body` sets `font-family: Arial`, so it was never applied); `metadata`; file-based icons. |
| Persistence | Browser `localStorage`: library, view, theme. |
| Build | Next 16.4.2 + Turbopack, Tailwind v4, React 19.3, React Compiler in annotation mode (`"use memo"`). |
| Tests | None. |

## 2. Architecture

```
index.html            renderer entry (loading screen until the library has loaded)
src/renderer/         main.tsx (bootstraps data, mounts App), App.tsx (was page.tsx), error boundary, globals.css
src/components/       unchanged UI: board, cards, views, form, ObsidianUI shell
src/lib/              bookmarks store (now backed by the main process), import/export, GitHub helpers
src/shared/ipc.ts     IPC channels, payload types, validators
src/preload/          contextBridge: window.linkbook (8 functions)
src/main/             main.ts (lifecycle), window.ts, menu.ts, ipc.ts, protocols.ts, security.ts, stores.ts, logger.ts
src/main/services/    json-store, preview, github, image-cache, net-guard
forge.config.ts       Forge: Vite plugin, deb maker, fuses, permission hook
vite.*.config.ts      main, preload, renderer builds
```

* **Production** loads `app://linkbook/index.html`, served by a protocol handler from the packaged renderer folder only (path traversal blocked), with a strict CSP header.
* **Development** (`pnpm start`) loads Vite's dev server with hot reload; a development CSP adds only what Vite needs.
* **No HTTP server.** The two API routes became main-process services reached over IPC.
* **Images.** `next/image`'s optimizer became the `lbimg://` scheme in the main process: fetch through the network guard, shrink PNG/JPEG with `nativeImage`, cache on disk (works offline), and remember dead images for a week without remembering network trouble.
* **Persistence.** Library and settings are JSON files in `userData` (`~/.config/LinkBook`), written atomically with a `.bak` copy and automatic recovery.

## 3. Feature checklist

"Tested" lists what was actually run. *e2e* = `pnpm test:e2e` (drives the real packaged app over the DevTools protocol), *unit* = `pnpm test`, *manual* = run and inspected in this migration.

| # | Feature | Migrated implementation | Tested |
|---|---|---|---|
| 1 | Board view, drag a card between columns | components unchanged | e2e: drag "Tailwind CSS" into Tools, "Moved to Tools" toast; unit: `moveBookmark` |
| 2 | Grid, Table, List views, view switcher | unchanged; choice saved in `settings.json` and shown as a radio group in the View menu | e2e: switches through all four views; Table persists across restart |
| 3 | Sidebar categories and tags, filters, tabs, search, sort | unchanged | e2e checks categories render; screenshots show the sidebar and toolbar. Filters, tabs, search, and sort weren't exercised in Electron (components unchanged). |
| 4 | Add / edit bookmark form with automatic preview | form unchanged; preview through IPC; the form's image preview through `lbimg://` | e2e: add via the form, persists across restart |
| 5 | Pin, move, copy link, delete with undo | unchanged; clipboard is the only permission granted | not run in Electron (components unchanged; move-by-drag is covered in row 1) |
| 6 | Add / delete category | unchanged | not run in Electron (component unchanged) |
| 7 | Import Netscape bookmarks HTML | Import button and Ctrl+O use the native file dialog (main reads the file, 32 MB cap); dropping a file on the window also imports | e2e: drop import (+2 bookmarks); unit: parser, merge, skip bookmarklets |
| 8 | **New:** export bookmarks | Export button and Ctrl+Shift+E write a Netscape HTML file through the native save dialog | unit: export → import round trip. The native dialog itself wasn't automated. |
| 9 | Bundled cybersecurity collection added once | unchanged | e2e: first run shows 228 bookmarks |
| 10 | Preview images, backfill, broken images | `lbimg://` cache; failures remembered by the main process instead of the renderer | manual online run: 44 images cached (500 KB), 0 log errors; unit: request parsing |
| 11 | GitHub repo stats | IPC service (port of `/api/github`) | manual online run: 16 repos got stats; unit: repo detection, staleness |
| 12 | Light / dark theme, following the system | `settings.json` + `nativeTheme`; View menu checkbox | e2e: theme persists across restart |
| 13 | Same-size cards, loading skeleton | unchanged; a loading screen in the window colors replaces the hydration skeleton | manual (screenshots) |
| 14 | Branding: logo, favicon, title | window and app icon, `.desktop` entry, About panel, `/usr/share/pixmaps/linkbook.png` | manual: deb contents inspected |
| 15 | Library persistence | atomic JSON store, `.bak`, recovery | unit: 8 store tests; e2e: restores the backup after the file is damaged |
| 16 | **New:** native desktop behavior | menus with shortcuts, single instance, saved window size and position (checked against connected displays), crash and hang dialogs, `main.log` | e2e: window bounds saved; `main.log` checked in every run. Menus, shortcuts, single instance, and crash dialogs weren't exercised. |

## 4. Adaptations

| Change | Why |
|---|---|
| `next/image` → `<img>` with `src`/`srcSet` from `lbimg://`, resized by `nativeImage` | No Next server. Resizing now covers PNG and JPEG; WebP, AVIF, GIF, and SVG are cached at original size (the Next optimizer re-encoded those to AVIF). |
| `next/font` removed | Geist was loaded but never applied (`body` uses Arial), so the UI looks the same. |
| `localStorage` → main-process JSON files | Reliable, atomic, recoverable, outside the renderer. Data saved by the web version isn't visible to the desktop app (different storage); use Export/Import to move it. |
| `/api/preview`, `/api/github` → `src/main/services/{preview,github}.ts` | Same logic and limits, called over IPC. `GITHUB_TOKEN` is read by the main process. |
| Image failures are remembered by the main process, not saved on the bookmark | The renderer can't tell a dead image from being offline; the main process can, so offline use no longer hides images for a week. |
| `"use client"` removed | No server components anymore. `"use memo"` stays for the React Compiler. |
| `src/app/` removed | Every file is accounted for above; the originals are in the backup. |
| `pnpm-workspace.yaml`: `nodeLinker: hoisted`, `allowBuilds: { electron: true }` | Electron Forge needs a flat `node_modules`; Electron's install step downloads its binary. |
| `make` scripts set `umask 022`; a Forge hook clears group-write bits | Without it the `.deb` inherited the build machine's umask (group-writable files under `/usr/lib`). |
| `--targets deb` (not `@electron-forge/maker-deb`) | Forge matches override targets by maker name; the package name created an unconfigured maker and dropped all `.deb` metadata. |

## 5. Commands

| Task | Command |
|---|---|
| Develop | `pnpm start` |
| Package | `pnpm package` → `out/LinkBook-linux-x64/` |
| Installer | `pnpm make:deb` → `out/make/deb/x64/linkbook_0.1.0_amd64.deb` |
| Checks | `pnpm check` (typecheck, lint, unit tests) |
| End-to-end | `pnpm package && pnpm test:e2e` |
| Install | `sudo apt install ./out/make/deb/x64/linkbook_0.1.0_amd64.deb` |
| Remove | `sudo apt remove linkbook` |

Build prerequisites: Node.js ≥ 22.13, pnpm ≥ 10, `dpkg`, `dpkg-deb`, `fakeroot`.

## 6. Tests executed (2026-10-20, PikaOS 4, Wayland, x64)

| Run | Result |
|---|---|
| `pnpm typecheck` | pass, 0 errors |
| `pnpm lint` | pass, 0 errors, 6 warnings (all `@next/next/no-img-element`, see limitations) |
| `pnpm test` (unit) | 5 files, **86/86 passed** |
| `pnpm test:e2e` against `out/LinkBook-linux-x64/linkbook` | **9/9 passed** |
| `pnpm test:e2e` against the `.deb`'s files, unpacked with `dpkg-deb -x` and launched through its `usr/bin/linkbook` symlink | **9/9 passed** |
| Packaged app online, fresh profile, 20 s | renders; 44 images cached through `lbimg://`; 0 direct page requests to other sites; 16 GitHub stats; 0 errors in `main.log` |
| `pnpm start` (development) | loads from the Vite dev server with hot reload, 228 bookmarks, clean `main.log` |
| **Installed system-wide** (`sudo apt install ./out/make/deb/x64/linkbook_0.1.0_amd64.deb`, run by the user) | `dpkg -s`: installed; `/usr/bin/linkbook` → `/usr/lib/linkbook/linkbook`; root-owned, `chrome-sandbox` 4755, `app.asar` 644; `desktop-file-validate` passes |
| Launch through the menu entry (`gio launch /usr/share/applications/linkbook.desktop`, test profile) | starts `/usr/lib/linkbook/linkbook`, clean `main.log`; launching `linkbook` again exits 0 and leaves one instance (single instance works); SIGTERM quits cleanly |
| `LINKBOOK_BINARY=/usr/bin/linkbook pnpm test:e2e` (installed build) | **9/9 passed** with the original suite; the added check (no temp files after quit) then **failed**, exposing the bug below |
| `pnpm test:e2e` on the rebuilt package with the fix | **9/9 passed**, including the new check |
| **Reinstalled fixed build** (`sudo apt install --reinstall …`, run by the user): `LINKBOOK_BINARY=/usr/bin/linkbook pnpm test:e2e` | installed `app.asar` byte-identical to the new build; **9/9 passed**; menu entry `Categories=Utility;` validates with no hints; launch through the menu entry and quit: clean log, no temp files, final window bounds saved |
| `.deb` inspection | control metadata, `.desktop` entry (`Utility`, `StartupWMClass=LinkBook`), icon, `/usr/bin/linkbook` symlink, permissions (directories 755, files 644/755, `chrome-sandbox` 4755) |

The e2e suite covers: first run (228 bookmarks from `app://linkbook/`); no `require`/`process`/`module` in the page and exactly 8 bridge functions; CSP blocking `fetch` and `<img>` to other sites; invalid IPC refused (`file://` preview, private-network preview, path-traversal repo, unknown theme, malformed library); drag a card between columns; switch all four views; drop-import a bookmarks file; add a bookmark through the form, then view, theme, and window bounds persisting across a restart; recovery from a damaged `library.json`.

Problems found and fixed during testing: quitting saved the window's final position after the save queue had been flushed, leaving `settings.json.tmp-<pid>` and losing that position (now flushed on `will-quit`, and stale temp files are removed on load); two main menu categories (`Utility;Network`) could list LinkBook twice (now `Utility`); IPC rejected the app's own page (Node's `URL` reports custom-scheme origins as `"null"`); offline image failures were being saved for a week; `.deb` metadata was dropped (`--targets`); group-writable package files; the e2e harness could leave a window open after a failed launch.

## 7. Remaining limitations

* **`apt remove` wasn't run**, since the app stays installed. Removal is `sudo apt remove linkbook`; your data in `~/.config/LinkBook` stays until you delete it.
* **Not tested in a clean environment.** Only this machine; no fresh VM or container.
* **Lint config still uses `eslint-config-next`.** Replacing `eslint.config.mjs` was blocked by the `ecc` config-protection hook. The Next preset loads its parser from the `next` package, so `next` remains as a **devDependency used only by ESLint** (not imported by the app, not in the package). The 6 lint warnings are its `next/image` rule, which doesn't apply in Electron. A Next-free replacement, to apply once you allow it:

  ```js
  // eslint.config.mjs — needs: pnpm add -D @eslint/js@9 typescript-eslint eslint-plugin-react-hooks globals
  import js from "@eslint/js";
  import reactHooks from "eslint-plugin-react-hooks";
  import { defineConfig, globalIgnores } from "eslint/config";
  import globals from "globals";
  import tseslint from "typescript-eslint";

  export default defineConfig([
    globalIgnores([".vite/**", "out/**", ".migration-backup/**"]),
    js.configs.recommended,
    ...tseslint.configs.recommended,
    { files: ["src/components/**", "src/lib/**", "src/renderer/**"], ...reactHooks.configs.flat.recommended, languageOptions: { globals: globals.browser } },
    { files: ["src/main/**", "src/preload/**", "tests/**", "*.config.*"], languageOptions: { globals: globals.node } },
  ]);
  ```

  Then remove `next` and `eslint-config-next` from `devDependencies`.
* **Menus and native dialogs aren't automated.** CDP can't press native menu accelerators or click GTK dialogs; Import (button/dialog), Export, and shortcuts were wired but only the drop-import path is under test.
* **Image resizing** covers PNG and JPEG; other formats are cached at their original size.
* **`GITHUB_TOKEN` from the applications menu** needs `~/.config/environment.d/` (see README), since desktop launches don't read shell profiles.
* **Maintainer field** in the `.deb` is `LinkBook <SYZADMIN666@proton.me>`; change it in `forge.config.ts` before sharing the package.
* **`components/block/dashboard-shell-page.tsx`** (the ObsidianUI demo page) is still in the tree but unused and not bundled.
