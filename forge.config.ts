import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { chmod, lstat, readdir } from "node:fs/promises";
import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { MakerAppImage } from "@reforged/maker-appimage";

// Shared by every Linux package, so they all describe the app the same way.
const app = {
  name: "linkbook",
  productName: "LinkBook",
  genericName: "Bookmark Manager",
  description: "Save, organize, and browse bookmarks on a board, grid, table, or list.",
  productDescription:
    "LinkBook is a free and open-source desktop bookmark manager for Linux, inspired by Linkwarden. Bookmarks are grouped into categories and tags, show preview images and GitHub stats, and can be imported from any browser's bookmarks export.",
  // One main category, so menus list LinkBook once.
  categories: ["Utility" as const],
  homepage: "https://github.com/0x0f2Root/LinkBook",
  icon: "assets/icons/512x512.png",
};

/** Clears group and world write bits, so nothing in /usr/lib/linkbook is writable by anyone but root. */
async function removeGroupWrite(target: string): Promise<void> {
  const info = await lstat(target);
  if (info.isSymbolicLink()) return;
  if (info.mode & 0o022) await chmod(target, info.mode & ~0o022 & 0o7777);
  if (info.isDirectory()) for (const entry of await readdir(target)) await removeGroupWrite(path.join(target, entry));
}

const config: ForgeConfig = {
  packagerConfig: {
    name: "LinkBook",
    executableName: "linkbook",
    appBundleId: "dev.linkbook.app",
    asar: true,
    // The window icon is read at runtime from resources/icons; the MIT notice ships with every copy.
    extraResource: ["assets/icons", "LICENSE"],
    icon: "assets/icons/512x512",
  },
  rebuildConfig: {},
  hooks: {
    // Copied files keep the build machine's umask; a group-writable file in a system package is a packaging bug.
    postPackage: async (_config, { outputPaths }) => {
      for (const output of outputPaths) await removeGroupWrite(output);
    },
  },
  makers: [
    new MakerDeb({
      options: {
        ...app,
        section: "web",
        priority: "optional",
        maintainer: "LinkBook <SYZADMIN666@proton.me>",
      },
    }),
    new MakerRpm({
      options: {
        ...app,
        license: "MIT",
      },
    }),
    new MakerAppImage({
      options: {
        name: app.name,
        bin: "linkbook",
        productName: app.productName,
        genericName: app.genericName,
        categories: app.categories,
        icon: app.icon,
        // A fixed release of the official AppImage runtime, not the moving "continuous" build.
        runtime: "https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64",
      },
    }),
    // A portable folder for any distribution: unzip and run ./linkbook.
    new MakerZIP({}, ["linux"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    // Locks the packaged binary down: it can't run as plain Node, ignores NODE_OPTIONS and inspector
    // flags, and only loads app code from its own integrity-checked asar archive.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
