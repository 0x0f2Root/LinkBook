// Records a demo of the packaged app: real clicks, typing, and drag and drop, captured from the window with
// the DevTools screencast and encoded with ffmpeg into assets/demo/linkbook-demo.gif.
//
//   pnpm package && pnpm demo:record
//
// Uses a throwaway profile and the live network (previews and GitHub stats are real). A cursor is drawn into the
// page for the recording only, since the screencast doesn't include the system pointer.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(import.meta.dirname, "..");
const binary = process.env.LINKBOOK_BINARY ?? path.join(root, "out/LinkBook-linux-x64/linkbook");
const outDir = path.join(root, "assets/demo");
const size = { width: 1440, height: 900 };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A browser-style bookmarks export, dropped on the window in the demo. Previews are fetched live.
const DEMO_FOLDERS = {
  Development: [
    ["https://nextjs.org/docs", "Next.js Docs", "react,nextjs,docs"],
    ["https://developer.mozilla.org/en-US/docs/Web", "MDN Web Docs", "docs,css,javascript"],
    ["https://tailwindcss.com/docs", "Tailwind CSS", "css,docs"],
    ["https://github.com/electron/electron", "Electron", "desktop,javascript"],
  ],
  Design: [
    ["https://www.refactoringui.com", "Refactoring UI", "ui,book"],
    ["https://fonts.google.com", "Google Fonts", "typography"],
    ["https://www.obsidianui.dev/docs/dashboard-shell", "ObsidianUI Dashboard Shell", "ui,react"],
  ],
  Reading: [
    ["https://paulgraham.com/greatwork.html", "How to Do Great Work", "essay,career"],
    ["https://overreacted.io", "overreacted", "react,essay"],
  ],
  Tools: [
    ["https://excalidraw.com", "Excalidraw", "diagrams,open-source"],
    ["https://www.raycast.com", "Raycast", "productivity"],
    ["https://github.com/microsoft/vscode", "Visual Studio Code", "editor,open-source"],
  ],
};
const DEMO_EXPORT = [
  "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
  "<DL><p>",
  ...Object.entries(DEMO_FOLDERS).flatMap(([folder, links]) => [
    `<DT><H3>${folder}</H3>`,
    "<DL><p>",
    ...links.map(([url, title, tags]) => `<DT><A HREF="${url}" TAGS="${tags}">${title}</A>`),
    "</DL><p>",
  ]),
  "</DL><p>",
].join("\n");

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

// ---- Launch ----
const userData = mkdtempSync(path.join(os.tmpdir(), "linkbook-demo-"));
writeFileSync(path.join(userData, "settings.json"), JSON.stringify({ theme: "light", display: "board", window: { x: 0, y: 0, ...size, maximized: false } }));
const frames = mkdtempSync(path.join(os.tmpdir(), "linkbook-demo-frames-"));
const port = await freePort();
const env = { ...process.env, LINKBOOK_USER_DATA_DIR: userData };
delete env.LINKBOOK_OFFLINE;
const app = spawn(binary, [`--remote-debugging-port=${port}`], { env, stdio: "ignore" });

let browser;
for (let i = 0; i < 60 && !browser; i++) {
  await wait(250);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
}
if (!browser) throw new Error("LinkBook didn't start");

async function shutdown() {
  await browser.close().catch(() => {});
  app.kill("SIGTERM");
  for (let i = 0; i < 40 && app.exitCode === null && app.signalCode === null; i++) await wait(250);
  rmSync(userData, { recursive: true, force: true });
}

try {
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().startsWith("app://linkbook/"));
    if (!page) await wait(250);
  }
  await page.waitForSelector(".obsidian-dashboard-shell");
  await page.setViewportSize(size).catch(() => {});

  // ---- A visible cursor, for the recording only ----
  await page.evaluate(() => {
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11-6.5 1.2 3.8 7.3-2.6 1.4-3.8-7.3L5 20z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    Object.assign(cursor.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 1px 2px rgb(0 0 0 / .35))" });
    document.body.append(cursor);
    const style = document.createElement("style");
    style.textContent = `.demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid #2563eb;animation:demo-ripple .45s ease-out forwards}@keyframes demo-ripple{from{opacity:.9;transform:scale(.3)}to{opacity:0;transform:scale(1.4)}}`;
    document.head.append(style);
    const place = (event) => (cursor.style.transform = `translate(${event.clientX - 3}px, ${event.clientY - 2}px)`);
    window.addEventListener("mousemove", place, true);
    window.addEventListener("dragover", place, true);
    window.addEventListener(
      "mousedown",
      (event) => {
        const ripple = document.createElement("div");
        ripple.className = "demo-ripple";
        Object.assign(ripple.style, { left: `${event.clientX}px`, top: `${event.clientY}px` });
        document.body.append(ripple);
        setTimeout(() => ripple.remove(), 500);
      },
      true,
    );
  });

  // ---- Screencast, with a pause switch to skip waiting time ----
  const cdp = await page.context().newCDPSession(page);
  const captured = [];
  let paused = false;
  let pausedFor = 0;
  let pausedAt = 0;
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    if (paused) return;
    const file = path.join(frames, `${String(captured.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    captured.push({ file, time: metadata.timestamp - pausedFor });
  });
  const pause = () => {
    paused = true;
    pausedAt = Date.now() / 1000;
  };
  const resume = () => {
    pausedFor += Date.now() / 1000 - pausedAt;
    paused = false;
  };
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: size.width, maxHeight: size.height, everyNthFrame: 1 });

  // ---- Interaction helpers ----
  const glide = (x, y, steps = 28) => page.mouse.move(x, y, { steps });
  const center = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const click = async (locator, pauseAfter = 700) => {
    const { x, y } = await center(locator);
    await glide(x, y);
    await wait(180);
    await page.mouse.click(x, y);
    await wait(pauseAfter);
  };
  const type = (text, delay = 55) => page.keyboard.type(text, { delay });
  const scrollBoard = async (amount, steps = 12) => {
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, amount / steps);
      await wait(40);
    }
  };

  // ---- The demo ----
  await glide(size.width / 2, size.height / 2, 1);
  await wait(1800);

  // 1. Empty first run: point at Import, then drop a browser's bookmarks export onto the window.
  const importButton = page.getByRole("button", { name: "Import bookmarks" });
  const importAt = await center(importButton);
  await glide(importAt.x, importAt.y);
  await wait(1200);
  await glide(size.width / 2, size.height / 2 + 120, 30);
  await page.evaluate((html) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([html], "bookmarks.html", { type: "text/html" }));
    window.dispatchEvent(new DragEvent("dragover", { dataTransfer: transfer, cancelable: true }));
    window.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, cancelable: true }));
  }, DEMO_EXPORT);
  await wait(2200);

  // Previews and GitHub stats load in the background; skip that wait in the video.
  pause();
  await wait(40_000);
  resume();
  await glide(760, 520, 20);
  await wait(800);
  await wait(1200);

  // 2. Paste a link: the preview fills in by itself.
  await click(page.getByRole("button", { name: "New bookmark" }).first(), 600);
  await type("https://github.com/linkwarden/linkwarden", 35);
  await wait(3500);
  // The form's tags field; card tag lists are also labelled "Tags" for screen readers.
  await click(page.locator('input[placeholder="react, docs"]'), 300);
  await type("self-hosted, bookmarks");
  await wait(600);
  await click(page.getByRole("button", { name: "Add bookmark", exact: true }), 1800);

  // 3. Drag the new card into another column.
  const card = page.locator("[data-bookmark-id]").filter({ hasText: /linkwarden/i }).first();
  const target = page.locator("section[aria-label]").nth(1);
  const from = await center(card);
  const targetBox = await target.boundingBox();
  await glide(from.x, from.y);
  await wait(250);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 10, { steps: 6 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 160, { steps: 40 });
  await wait(400);
  await page.mouse.up();
  await wait(1600);

  // 4. Four views of the same library.
  await click(page.getByRole("radio", { name: "Grid" }), 1800);
  await scrollBoard(600);
  await wait(600);
  await click(page.getByRole("radio", { name: "Table" }), 1500);
  await click(page.locator("thead").getByRole("button", { name: "Title" }), 1800);
  await click(page.getByRole("radio", { name: "List" }), 1800);
  await scrollBoard(500);
  await wait(500);
  await click(page.getByRole("radio", { name: "Board" }), 1400);

  // 5. Find things: search, then a tag.
  await click(page.getByRole("button", { name: /^Search bookmarks/ }), 400);
  await type("docs", 110);
  await wait(1600);
  await page.keyboard.press("Escape");
  await wait(400);
  await click(page.getByRole("button", { name: "Clear" }), 900);
  await click(page.getByRole("button", { name: "#react" }).first(), 1800);
  await click(page.getByRole("button", { name: "Clear" }), 900);

  // 6. Pin a bookmark and look at the Pinned tab.
  const firstCard = page.locator("[data-bookmark-id]").first();
  const firstCenter = await center(firstCard);
  await glide(firstCenter.x, firstCenter.y);
  await wait(400);
  await click(firstCard.getByRole("button", { name: /^Pin / }), 900);
  await click(page.getByRole("tab", { name: "Pinned" }), 1600);
  await click(page.getByRole("tab", { name: "All" }), 900);

  // 7. Dark mode.
  await click(page.getByRole("button", { name: "Use dark theme" }), 1600);
  await glide(760, 520, 30);
  await wait(2200);

  await cdp.send("Page.stopScreencast");
  console.log(`Captured ${captured.length} frames`);

  // ---- Encode ----
  // The screencast sends a frame only when something changes, so each frame is held until the next one.
  const end = captured.at(-1).time + 1.5;
  const list = captured
    .map((frame, i) => `file '${frame.file}'\nduration ${Math.max(0.001, (captured[i + 1]?.time ?? end) - frame.time).toFixed(3)}`)
    .join("\n");
  writeFileSync(path.join(frames, "list.txt"), `${list}\nfile '${captured.at(-1).file}'\n`);
  mkdirSync(outDir, { recursive: true });
  const ffmpeg = (args) => {
    const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
  };
  const input = ["-f", "concat", "-safe", "0", "-i", path.join(frames, "list.txt")];
  // An intermediate video at a steady frame rate, kept only long enough to make the GIF from it.
  const video = path.join(frames, "linkbook-demo.mp4");
  ffmpeg([...input, "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", video]);
  ffmpeg([
    "-i",
    video,
    "-vf",
    "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    path.join(outDir, "linkbook-demo.gif"),
  ]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`Wrote ${path.relative(root, outDir)}/linkbook-demo.gif`);
} finally {
  await shutdown();
}
