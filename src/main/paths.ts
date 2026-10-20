// Imported first by main.ts, before any module reads app.getPath("userData").
import path from "node:path";
import { app } from "electron";

// Lets tests (and anyone wanting a separate profile) run against their own data directory.
const override = process.env.LINKBOOK_USER_DATA_DIR;
if (override) app.setPath("userData", path.resolve(override));

/** Packaged: <resources>/icons (Forge extraResource). Development: assets/icons in the project. */
export const iconsDir = app.isPackaged ? path.join(process.resourcesPath, "icons") : path.join(app.getAppPath(), "assets/icons");
