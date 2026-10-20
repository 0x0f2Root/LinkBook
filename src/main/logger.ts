import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

const MAX_BYTES = 1024 * 1024;
let file: string | null = null;

function logFile() {
  if (file) return file;
  const directory = path.join(app.getPath("userData"), "logs");
  mkdirSync(directory, { recursive: true });
  file = path.join(directory, "main.log");
  return file;
}

/** Appends to <userData>/logs/main.log (rotated at 1 MB to main.log.1) and mirrors to the terminal. */
export function log(level: "info" | "warn" | "error", message: string, detail?: unknown) {
  const extra = detail instanceof Error ? ` ${detail.stack ?? detail.message}` : detail !== undefined ? ` ${JSON.stringify(detail)}` : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${extra}\n`;
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line.trimEnd());
  try {
    const target = logFile();
    try {
      if (statSync(target).size > MAX_BYTES) renameSync(target, `${target}.1`);
    } catch {}
    appendFileSync(target, line);
  } catch {
    // Logging must never take the app down.
  }
}
