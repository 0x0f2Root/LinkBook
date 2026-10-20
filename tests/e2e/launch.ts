import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

export type RunningApp = { page: Page; output: () => string; close: () => Promise<void> };

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("No port"))));
    });
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the packaged app (or LINKBOOK_BINARY, e.g. /usr/bin/linkbook after installing the .deb) with its own
 * data folder and the network off, and attaches to its window over the DevTools protocol. The packaged binary's
 * fuses block Node's inspector, so this goes through Chromium's remote debugging instead.
 */
export async function launchApp(userData: string): Promise<RunningApp> {
  const binary = process.env.LINKBOOK_BINARY ?? path.resolve("out/LinkBook-linux-x64/linkbook");
  const port = await freePort();
  const child: ChildProcess = spawn(binary, [`--remote-debugging-port=${port}`], {
    env: { ...process.env, LINKBOOK_USER_DATA_DIR: userData, LINKBOOK_OFFLINE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => (output += chunk));
  child.stderr?.on("data", (chunk) => (output += chunk));

  let browser: Browser | null = null;
  let page: Page | undefined;
  try {
    for (let attempt = 0; attempt < 60 && !browser; attempt += 1) {
      await wait(250);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
    }
    if (!browser) throw new Error("The app didn't open a debugging port.");

    for (let attempt = 0; attempt < 60 && !page; attempt += 1) {
      page = browser.contexts().flatMap((context) => context.pages()).find((candidate) => candidate.url().startsWith("app://linkbook/"));
      if (!page) await wait(250);
    }
    if (!page) throw new Error("The app window never loaded app://linkbook/.");
    // The shell, in whichever view was saved, or the error screen.
    await page.waitForSelector(".obsidian-dashboard-shell, [role=alert]", { timeout: 30_000 });
  } catch (error) {
    // A launch that fails halfway must not leave a window behind.
    await browser?.close().catch(() => {});
    child.kill("SIGKILL");
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${output}`);
  }

  const connected = browser;
  return {
    page,
    output: () => output,
    close: async () => {
      await connected.close().catch(() => {});
      if (child.exitCode !== null || child.signalCode !== null) return;
      // SIGTERM quits the way the window's close button does, so pending saves are flushed first.
      child.kill("SIGTERM");
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await wait(250);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    },
  };
}
