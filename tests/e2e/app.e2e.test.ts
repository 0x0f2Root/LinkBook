import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SAMPLE_LIBRARY } from "../fixtures/sample-library";
import { launchApp, type RunningApp } from "./launch";

const temporaryDirs: string[] = [];
async function profile({ withSampleLibrary = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "linkbook-e2e-"));
  temporaryDirs.push(dir);
  // The app starts empty, so tests that need cards to work with get the 11 sample bookmarks written in first.
  if (withSampleLibrary) await writeFile(path.join(dir, "library.json"), JSON.stringify(SAMPLE_LIBRARY), "utf8");
  return dir;
}
afterAll(async () => {
  await Promise.all(temporaryDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

const cardCount = (app: RunningApp) => app.page.locator("[data-bookmark-id]").count();
const toastText = (app: RunningApp) => app.page.locator("[role=status]").last().innerText();
const SAMPLE_COUNT = SAMPLE_LIBRARY.bookmarks.length;

describe("first run", () => {
  let app: RunningApp;
  beforeAll(async () => {
    app = await launchApp(await profile());
  });
  afterAll(() => app?.close());

  it("starts from app://linkbook/ with zero bookmarks and an empty Unsorted category", async () => {
    expect(await app.page.title()).toBe("LinkBook");
    expect(app.page.url()).toBe("app://linkbook/index.html");
    await expect.poll(() => app.page.getByRole("heading", { name: "Your board is empty" }).count()).toBe(1);
    expect(await cardCount(app)).toBe(0);
    expect(await app.page.locator('section[aria-label="Unsorted"]').count()).toBe(1);
    // Nothing is added on its own: a moment later the board is still empty.
    await app.page.waitForTimeout(1500);
    expect(await cardCount(app)).toBe(0);
  });

  it("offers only New bookmark and Import bookmarks on the empty board", async () => {
    const panel = app.page.locator('section[aria-labelledby="start-panel-title"]');
    const buttons = await panel.getByRole("button").allInnerTexts();
    expect(buttons.map((text) => text.trim())).toEqual(["New bookmark", "Import bookmarks"]);
    expect(await app.page.getByText(/cybersecurity/i).count()).toBe(0);
  });

  it("imports a bookmarks file dropped on the window", async () => {
    const before = await cardCount(app);
    await app.page.evaluate(() => {
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Dropped</H3><DL><p>
        <DT><A HREF="https://dropped-one.example/" TAGS="e2e">Dropped one</A>
        <DT><A HREF="https://dropped-two.example/">Dropped two</A></DL><p></DL><p>`;
      const transfer = new DataTransfer();
      transfer.items.add(new File([html], "bookmarks.html", { type: "text/html" }));
      window.dispatchEvent(new DragEvent("dragover", { dataTransfer: transfer, cancelable: true }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
    });
    await expect.poll(() => cardCount(app)).toBe(before + 2);
    expect(await toastText(app)).toContain("Imported 2 bookmarks");
    // With bookmarks on the board, the empty-board panel goes away.
    expect(await app.page.getByRole("heading", { name: "Your board is empty" }).count()).toBe(0);
  });
});

describe("with a library", () => {
  let app: RunningApp;
  beforeAll(async () => {
    app = await launchApp(await profile({ withSampleLibrary: true }));
  });
  afterAll(() => app?.close());

  it("loads the saved library", async () => {
    await expect.poll(() => cardCount(app)).toBe(SAMPLE_COUNT);
    expect(await app.page.getByRole("heading", { name: "Your board is empty" }).count()).toBe(0);
  });

  it("gives the page no Node, Electron, or raw IPC, only the typed bridge", async () => {
    const globals = await app.page.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      module: typeof (window as unknown as { module?: unknown }).module,
      bridge: Object.keys(window.linkbook).sort(),
    }));
    expect(globals).toEqual({
      require: "undefined",
      process: "undefined",
      module: "undefined",
      bridge: ["bootstrap", "fetchGithubStats", "fetchPreview", "onMenuCommand", "openImportDialog", "saveExport", "saveLibrary", "setSettings"],
    });
  });

  it("blocks the page from contacting other sites directly (Content Security Policy)", async () => {
    const result = await app.page.evaluate(async () => {
      const fetchResult = await fetch("https://example.com/").then(
        () => "loaded",
        () => "blocked",
      );
      const imageResult = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve("loaded");
        image.onerror = () => resolve("blocked");
        image.src = "https://www.google.com/favicon.ico";
      });
      return { fetchResult, imageResult };
    });
    expect(result).toEqual({ fetchResult: "blocked", imageResult: "blocked" });
  });

  it("refuses invalid IPC input", async () => {
    const result = await app.page.evaluate(async () => ({
      preview: await window.linkbook.fetchPreview("file:///etc/passwd"),
      privatePreview: await window.linkbook.fetchPreview("http://127.0.0.1:22/"),
      github: await window.linkbook.fetchGithubStats("../../etc/passwd"),
      settings: await window.linkbook.setSettings({ theme: "neon" } as never).then(
        () => "accepted",
        () => "rejected",
      ),
      save: await window.linkbook.saveLibrary({ bookmarks: "nope" } as never),
    }));
    expect(result.preview).toMatchObject({ ok: false, code: "invalid" });
    // Offline mode answers before any lookup; either way nothing is fetched.
    expect(result.privatePreview).toMatchObject({ ok: false });
    expect(result.github).toMatchObject({ ok: false, code: "invalid" });
    expect(result.settings).toBe("rejected");
    expect(result.save).toMatchObject({ ok: false, code: "invalid" });
  });

  it("moves a card to another column by dragging it", async () => {
    const tools = () => app.page.locator('section[aria-label="Tools"] [data-bookmark-id]').evaluateAll((cards) => cards.map((card) => card.getAttribute("data-bookmark-id")));
    expect(await tools()).not.toContain("tailwind");
    await app.page.evaluate(() => {
      const card = document.querySelector('[data-bookmark-id="tailwind"]')!;
      const column = document.querySelector('section[aria-label="Tools"]')!;
      const box = column.getBoundingClientRect();
      const transfer = new DataTransfer();
      const at = { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: box.left + 20, clientY: box.top + 60 };
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
      column.dispatchEvent(new DragEvent("dragover", at));
      column.dispatchEvent(new DragEvent("drop", at));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
    });
    await expect.poll(tools).toContain("tailwind");
    expect(await toastText(app)).toContain("Moved to Tools");
  });

  it("switches between the board, grid, table, and list views", async () => {
    await app.page.getByRole("radio", { name: "Grid" }).click();
    await expect.poll(() => app.page.locator("ul li article[data-bookmark-id]").count()).toBe(SAMPLE_COUNT);
    expect(await app.page.locator('section[aria-label="Tools"]').count()).toBe(0);

    await app.page.getByRole("radio", { name: "Table" }).click();
    await expect.poll(() => app.page.locator("tbody tr").count()).toBe(SAMPLE_COUNT);
    expect(await app.page.getByRole("button", { name: "Title" }).count()).toBe(1);

    await app.page.getByRole("radio", { name: "List" }).click();
    await expect.poll(() => app.page.locator("section[aria-label] header h2").count()).toBe(SAMPLE_LIBRARY.categories.length);

    await app.page.getByRole("radio", { name: "Board" }).click();
    await expect.poll(() => app.page.locator('section[aria-label="Tools"]').count()).toBe(1);
  });
});

describe("persistence across restarts", () => {
  it("keeps a bookmark added in the form, the chosen view, and the theme", async () => {
    const userData = await profile();
    const first = await launchApp(userData);
    let darkBefore = false;
    try {
      // From a completely empty first run, through the toolbar's New bookmark button.
      await first.page.getByRole("button", { name: "New bookmark" }).first().click();
      await first.page.getByLabel("URL", { exact: true }).fill("https://e2e-persistence.example/page");
      await first.page.getByLabel("Title", { exact: true }).fill("E2E persistence check");
      await first.page.getByRole("button", { name: "Add bookmark", exact: true }).click();
      await expect.poll(() => first.page.getByText("E2E persistence check").count()).toBeGreaterThan(0);

      await first.page.getByRole("radio", { name: "Table" }).click();
      darkBefore = await first.page.evaluate(() => !!document.querySelector(".dark .obsidian-dashboard-shell, .obsidian-dashboard-shell.dark"));
      await first.page.getByRole("button", { name: darkBefore ? "Use light theme" : "Use dark theme" }).click();
      // Saves go out on every change; give the last one a moment before quitting.
      await first.page.waitForTimeout(500);
    } finally {
      await first.close();
    }

    // Quitting waits for every save, including the window's final position, so no write is left half-done.
    expect((await readdir(userData)).filter((name) => name.includes(".tmp-"))).toEqual([]);
    const library = JSON.parse(await readFile(path.join(userData, "library.json"), "utf8"));
    expect(library.bookmarks).toHaveLength(1);
    expect(library.bookmarks[0]).toMatchObject({ title: "E2E persistence check", categoryId: "unsorted" });
    const settings = JSON.parse(await readFile(path.join(userData, "settings.json"), "utf8"));
    expect(settings.display).toBe("table");
    expect(settings.theme).toBe(darkBefore ? "light" : "dark");
    expect(settings.window.width).toBeGreaterThan(0);

    const second = await launchApp(userData);
    try {
      expect(await second.page.getByRole("radio", { name: "Table" }).getAttribute("aria-checked")).toBe("true");
      expect(await second.page.locator("tbody tr").filter({ hasText: "E2E persistence check" }).count()).toBe(1);
      const darkAfter = await second.page.evaluate(() => !!document.querySelector(".dark .obsidian-dashboard-shell, .obsidian-dashboard-shell.dark"));
      expect(darkAfter).toBe(!darkBefore);
    } finally {
      await second.close();
    }
  });
});

describe("recovery", () => {
  it("restores the last good copy when the library file is damaged", async () => {
    const userData = await profile({ withSampleLibrary: true });
    // The last save is also kept as the backup, the way the store leaves it after a normal session.
    await cp(path.join(userData, "library.json"), path.join(userData, "library.json.bak"));
    await writeFile(path.join(userData, "library.json"), '{"categories": [', "utf8");

    const app = await launchApp(userData);
    try {
      await expect.poll(() => cardCount(app), { timeout: 15_000 }).toBe(SAMPLE_COUNT);
      expect(await toastText(app)).toContain("last good copy was restored");
    } finally {
      await app.close();
    }
  });
});
