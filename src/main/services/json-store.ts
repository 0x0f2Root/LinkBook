import { constants } from "node:fs";
import { copyFile, mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

export type LoadResult<T> =
  | { status: "missing" }
  | { status: "ok"; value: T }
  /** The main file was unreadable; the backup was valid and is now the main file again. */
  | { status: "restored-backup"; value: T; damagedCopy: string }
  /** Neither file was usable. The damaged file was moved aside. */
  | { status: "reset"; damagedCopy: string };

/**
 * A JSON document in one file, written atomically: the new content goes to a temporary file that is
 * flushed to disk and renamed over the old one, so a crash or power loss leaves either the old or the
 * new version, never half of one. The previous good version is kept as `<name>.bak`.
 */
export class JsonStore<T> {
  readonly file: string;
  private readonly backup: string;
  private queue: Promise<void> = Promise.resolve();
  private latest: { value: T } | null = null;

  constructor(
    directory: string,
    name: string,
    private readonly isValid: (value: unknown) => value is T,
  ) {
    this.file = path.join(directory, name);
    this.backup = `${this.file}.bak`;
  }

  async load(): Promise<LoadResult<T>> {
    await this.removeStaleTemporaryFiles();
    const main = await this.read(this.file);
    if (main.kind === "ok") return { status: "ok", value: main.value };
    if (main.kind === "missing") {
      // A crash between "copy to .bak" and "rename" can leave only the backup.
      const backup = await this.read(this.backup);
      return backup.kind === "ok" ? { status: "ok", value: backup.value } : { status: "missing" };
    }

    const damagedCopy = `${this.file}.damaged-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await rename(this.file, damagedCopy).catch(() => {});
    const backup = await this.read(this.backup);
    if (backup.kind === "ok") {
      await copyFile(this.backup, this.file).catch(() => {});
      return { status: "restored-backup", value: backup.value, damagedCopy };
    }
    return { status: "reset", damagedCopy };
  }

  /** Saves are queued and coalesced: a burst of changes writes only the last one after the current write. */
  save(value: T): Promise<void> {
    this.latest = { value };
    this.queue = this.queue.then(async () => {
      const next = this.latest;
      if (!next) return;
      this.latest = null;
      await this.write(next.value);
    });
    return this.queue;
  }

  /** Resolves once every queued save is on disk. */
  flush() {
    return this.queue;
  }

  /** A write cut short by a crash or power loss leaves `<name>.tmp-<pid>`; the real file is untouched, so it can go. */
  private async removeStaleTemporaryFiles() {
    const prefix = `${path.basename(this.file)}.tmp-`;
    const names = await readdir(path.dirname(this.file)).catch(() => [] as string[]);
    await Promise.all(names.filter((name) => name.startsWith(prefix)).map((name) => unlink(path.join(path.dirname(this.file), name)).catch(() => {})));
  }

  private async read(file: string): Promise<{ kind: "ok"; value: T } | { kind: "missing" } | { kind: "damaged" }> {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? { kind: "missing" } : { kind: "damaged" };
    }
    try {
      const value: unknown = JSON.parse(text);
      return this.isValid(value) ? { kind: "ok", value } : { kind: "damaged" };
    } catch {
      return { kind: "damaged" };
    }
  }

  private async write(value: T) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp-${process.pid}`;
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, 0o600);
    try {
      await handle.writeFile(JSON.stringify(value), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      // The current file was written by this store, so it's valid and becomes the backup.
      await copyFile(this.file, this.backup);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(temporary, this.file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
}
