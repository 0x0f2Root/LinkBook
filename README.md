<div align="center">
  <img src="./assets/icons/256x256.png" width="100px" alt="LinkBook logo" />
  <h1>LinkBook</h1>
  <h3>A free and open-source alternative to Linkwarden for Linux</h3>

<img src="https://img.shields.io/badge/platform-Linux-black?logo=linux&logoColor=white" alt="Platform: Linux">
<img src="https://img.shields.io/badge/package-.deb-black?logo=debian&logoColor=white" alt="Package: .deb">
<img src="https://img.shields.io/badge/Electron-44-black?logo=electron&logoColor=white" alt="Electron 44">
<img src="https://img.shields.io/badge/React-19-black?logo=react&logoColor=white" alt="React 19">
<img src="https://img.shields.io/badge/TypeScript-strict-black?logo=typescript&logoColor=white" alt="TypeScript">
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-black" alt="License: MIT"></a>

</div>

<div align='center'>

[Features](#features) · [Install](#install) · [Import your bookmarks](#import-your-bookmarks) · [Shortcuts](#keyboard-shortcuts) · [Development](#development)

<img src="./assets/screenshots/board-dark.png" alt="LinkBook's board view in dark mode, with Next.js and Programming bookmarks in category columns" />

</div>

## Intro & motivation

**LinkBook is a desktop bookmark manager for Linux to collect, organize, and browse the links that matter, all in one window.**

[Linkwarden](https://github.com/linkwarden/linkwarden) showed how good a bookmark manager can be: collections, tags, previews, and a clean interface. But it's a web service. You run a server, a database, and a browser tab, or you pay for the cloud.

LinkBook brings that experience to the desktop. It's one app you install with a `.deb`. Your bookmarks are a file in your home folder. There's no account, no server, and no sync service between you and your links. It opens instantly, works offline, and stays out of the way.

Bookmarks live in categories and tags, and every link gets its title, description, and preview image filled in automatically. Links to GitHub repositories show their stars, forks, language, and last push. You can look at your library as a kanban board, a grid of cards, a sortable table, or a compact list.

> [!TIP]
> LinkBook keeps everything on your computer, in `~/.config/LinkBook`. Coming from your browser? Export your bookmarks as HTML and drop the file onto the LinkBook window.

## Features

- 🗂️ Four views of the same library: **Board** (kanban), **Grid**, **Table**, and **List**
- 🖱️ Drag bookmarks between category columns to reorganize them
- ✨ Paste a link and its title, description, and preview image fill in automatically
- 🐙 GitHub repository links show stars, forks, open issues, language, license, and last push
- 📂 Organize by category and multiple tags, with pinned and unread bookmarks
- 🔍 Search by title, URL, description, or tag; filter by tag; sort by date or title
- ⬆️ Import any browser's bookmarks export (Chrome, Firefox, Edge, Brave, Safari), from the Import button or by dropping the file on the window
- ⬇️ Export your whole library as a standard bookmarks HTML file, readable by every browser
- 🖼️ Preview images are resized and cached on disk, so the board loads fast and works offline
- 🌓 Light and dark mode, following your system theme by default
- 💾 Saved locally in a plain JSON file, written safely with an automatic backup and recovery from damaged files
- ⌨️ Native menus and keyboard shortcuts for everything you do often
- 🛡️ No account, no server, and no telemetry. The app talks to the internet only to fetch link previews, images, and GitHub stats, and can be run fully offline.
- 🔐 Hardened Electron app: sandboxed window, strict Content Security Policy, and a private-network guard on every fetch
- 📭 Starts with a clean, empty board: no sample data and nothing added on its own
- 🐧 Built for Linux, packaged as a `.deb` with a desktop menu entry and a `linkbook` command

## See it in action

<div align="center">
  <img src="./assets/demo/linkbook-demo.gif" alt="Demo: starting from an empty board, importing a browser bookmarks export, pasting a GitHub link that fills in its own preview, dragging a card between columns, switching between board, grid, table, and list, searching, filtering by tag, pinning, and switching to dark mode" />
</div>

The demo is recorded from the real app by `pnpm demo:record`, so it can be re-recorded after any change.

## Screenshots

<div align="center">
  <img src="./assets/screenshots/grid-light.png" width="49%" alt="Grid view in light mode, with preview images for each bookmark" />
  <img src="./assets/screenshots/grid-dark.png" width="49%" alt="Grid view in dark mode" />
  <img src="./assets/screenshots/list-dark.png" width="98%" alt="List view in dark mode, with bookmarks grouped by category and their descriptions on one line" />
</div>

## LinkBook and Linkwarden

LinkBook is inspired by Linkwarden and is not affiliated with it. They solve the same problem in different places:

| | LinkBook | Linkwarden |
|---|---|---|
| Runs as | A Linux desktop app | A self-hosted web app or a paid cloud |
| Setup | Install one `.deb` | Deploy a server and a database, or sign up |
| Account | None | Required |
| Where your data lives | A JSON file in your home folder | Your server or their cloud |
| Preview images and metadata | Yes | Yes |
| Page archives (screenshot, PDF, reader view) | Not yet | Yes |
| Collaboration and sharing | No (single user) | Yes |
| Mobile apps and browser extension | No | Yes |

If you need archives, teams, or phones, Linkwarden is the better fit. If you want a fast, private bookmark board on your Linux desktop, that's what LinkBook is for.

## Install

LinkBook is distributed as a Debian package for x64 Linux, for Debian, Ubuntu, and their derivatives. It's tested on PikaOS 4 under Wayland. Build it from source:

```bash
pnpm install
pnpm make:deb
sudo apt install ./out/make/deb/x64/linkbook_0.1.0_amd64.deb
```

LinkBook then appears in your applications menu under **Utility** and runs as `linkbook` from a terminal. Opening it again while it's running brings the existing window forward.

To remove it:

```bash
sudo apt remove linkbook
```

Removing the package keeps your bookmarks in `~/.config/LinkBook`. Delete that folder to remove them too.

## Import your bookmarks

1. In your browser, export your bookmarks as an HTML file (Chrome and Edge: *Bookmark manager → ⋮ → Export bookmarks*; Firefox: *Library → Import and Backup → Export Bookmarks to HTML*).
2. In LinkBook, click **Import** (or press Ctrl+O), or drop the file onto the window.

Folders become categories, tags and dates are kept, and links you already have are skipped. You can undo an import right after it finishes. To move bookmarks the other way, **Export** (Ctrl+Shift+E) writes the same format.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Ctrl+N | New bookmark |
| Ctrl+O | Import bookmarks |
| Ctrl+Shift+E | Export bookmarks |
| Ctrl+F | Search |
| Ctrl+1 … Ctrl+4 | Board, Grid, Table, List |
| Ctrl+Shift+L | Toggle dark theme |
| Ctrl+Q | Quit |

## Your data

Everything lives in `~/.config/LinkBook`:

| File | What |
|---|---|
| `library.json` | Your bookmarks and categories. Every change is written atomically, so a crash or power cut never leaves half a file. |
| `library.json.bak` | The previous version. If `library.json` is ever damaged, LinkBook restores this copy automatically and keeps the damaged file aside. |
| `settings.json` | Theme, view, and window size and position. |
| `image-cache/` | Resized preview images and site icons, capped at 400 MB. |
| `logs/main.log` | What the app did, for troubleshooting. |

To back up LinkBook, copy that folder, or use **Export** for a file any browser can read.

## Configuration

| Variable | Effect |
|---|---|
| `GITHUB_TOKEN` | A GitHub personal access token (no scopes needed) raises GitHub's limit from 60 to 5,000 lookups an hour. When you start LinkBook from the applications menu, put `GITHUB_TOKEN=...` in `~/.config/environment.d/linkbook.conf` and log in again. |
| `LINKBOOK_OFFLINE=1` | Never contact the internet: no previews or GitHub stats, only cached images. |
| `LINKBOOK_USER_DATA_DIR` | Use a different data folder, for a separate profile. |
| `LINKBOOK_DEVTOOLS=1` | Allow the developer tools in the installed app. |

## Like LinkBook? Give it a star ⭐

Starring the repository and telling a friend who's tired of browser bookmarks are the best ways to help.

## Suggestions & roadmap

Ideas and bug reports are welcome as issues in the repository. Things that would make LinkBook better, roughly in order:

- Page archives (screenshot and PDF), like Linkwarden's, to protect against link rot
- Bulk actions: select several bookmarks to move, tag, or delete
- More package formats: AppImage, Flatpak, and `.rpm`
- Optional sync between computers

These are ideas, not promises.

## Development

Requirements: Node.js 22.13 or newer, pnpm 10 or newer, and `dpkg`, `dpkg-deb`, and `fakeroot` for packaging.

```bash
pnpm install          # dependencies; Electron downloads its binary on first use
pnpm start            # run with hot reload
pnpm package          # packaged app in out/LinkBook-linux-x64/
pnpm make:deb         # the installer in out/make/deb/x64/
pnpm check            # typecheck, lint, and unit tests
pnpm test:e2e         # end-to-end tests against the packaged app (run pnpm package first)
pnpm demo:record      # re-record the demo GIF in assets/demo/ (run pnpm package first)
```

`pnpm test:e2e` opens and closes LinkBook windows for about ten seconds, using a throwaway profile with the network off. Set `LINKBOOK_BINARY=/usr/bin/linkbook` to test an installed copy.

```
src/main/        Electron main process: window, menu, storage, link previews, images, GitHub stats
src/preload/     the small, typed bridge the window uses to reach the main process
src/shared/      the contract between the two: channels, types, and input validation
src/renderer/    the window's entry point
src/components/  the interface: board, cards, views, forms, and the ObsidianUI shell
src/lib/         bookmarks, import and export, GitHub helpers
tests/           unit tests (Vitest) and end-to-end tests (Playwright over DevTools)
```

LinkBook began as a Next.js web app. [docs/MIGRATION.md](docs/MIGRATION.md) explains how it became a desktop app, with the test results.

## Security

The window is sandboxed with context isolation and no Node.js access. It can't load remote scripts or contact websites directly. Everything it needs from the system goes through eight validated functions. Links open in your browser, never inside the app. Previews, images, and GitHub stats are fetched by the app itself, which refuses addresses on your local network. The installed binary can't be run as plain Node.js and only loads its own integrity-checked code.

If you find a security issue, please don't open a public issue. Email [SYZADMIN666@proton.me](mailto:SYZADMIN666@proton.me) instead. Thanks!

## License

LinkBook is free and open source under the [MIT License](LICENSE). You can use, copy, modify, and share it, including in commercial projects, as long as the copyright notice and license text come along.

## Thanks

LinkBook stands on the work of others:

- [Linkwarden](https://github.com/linkwarden/linkwarden), the inspiration for the whole idea
- [ObsidianUI](https://www.obsidianui.dev), for the dashboard shell the interface is built on
- [Electron](https://www.electronjs.org), [Electron Forge](https://www.electronforge.io), [Vite](https://vite.dev), [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Radix](https://www.radix-ui.com), [Motion](https://motion.dev), [Lucide](https://lucide.dev), and Duo Icons
- [Unsplash](https://unsplash.com), for the photos on the sample bookmarks in the screenshots and tests
