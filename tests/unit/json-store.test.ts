import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonStore } from "@/main/services/json-store";

type Doc = { n: number };
const isDoc = (value: unknown): value is Doc => typeof (value as Doc)?.n === "number";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "linkbook-store-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("JsonStore", () => {
  it("reports a missing file on first run", async () => {
    expect(await new JsonStore(dir, "doc.json", isDoc).load()).toEqual({ status: "missing" });
  });

  it("saves and loads", async () => {
    const store = new JsonStore(dir, "doc.json", isDoc);
    await store.save({ n: 1 });
    expect(await new JsonStore(dir, "doc.json", isDoc).load()).toEqual({ status: "ok", value: { n: 1 } });
  });

  it("keeps the previous version as a backup and leaves no temporary files", async () => {
    const store = new JsonStore(dir, "doc.json", isDoc);
    await store.save({ n: 1 });
    await store.save({ n: 2 });
    expect(JSON.parse(await readFile(path.join(dir, "doc.json.bak"), "utf8"))).toEqual({ n: 1 });
    expect((await readdir(dir)).sort()).toEqual(["doc.json", "doc.json.bak"]);
  });

  it("coalesces a burst of saves and writes the last one", async () => {
    const store = new JsonStore(dir, "doc.json", isDoc);
    await Promise.all(Array.from({ length: 50 }, (_, n) => store.save({ n })));
    expect(JSON.parse(await readFile(path.join(dir, "doc.json"), "utf8"))).toEqual({ n: 49 });
  });

  it("restores the backup when the main file is damaged, keeping the damaged copy", async () => {
    const store = new JsonStore(dir, "doc.json", isDoc);
    await store.save({ n: 1 });
    await store.save({ n: 2 });
    await writeFile(path.join(dir, "doc.json"), '{"n": 3,', "utf8");

    const result = await new JsonStore(dir, "doc.json", isDoc).load();
    expect(result.status).toBe("restored-backup");
    if (result.status !== "restored-backup") return;
    expect(result.value).toEqual({ n: 1 });
    expect(await readFile(result.damagedCopy, "utf8")).toBe('{"n": 3,');
    expect(JSON.parse(await readFile(path.join(dir, "doc.json"), "utf8"))).toEqual({ n: 1 });
  });

  it("treats valid JSON with the wrong shape as damaged", async () => {
    await writeFile(path.join(dir, "doc.json"), '{"n":"one"}', "utf8");
    const result = await new JsonStore(dir, "doc.json", isDoc).load();
    expect(result.status).toBe("reset");
  });

  it("resets, keeping the damaged file, when nothing is readable", async () => {
    await writeFile(path.join(dir, "doc.json"), "garbage", "utf8");
    await writeFile(path.join(dir, "doc.json.bak"), "also garbage", "utf8");
    const result = await new JsonStore(dir, "doc.json", isDoc).load();
    expect(result.status).toBe("reset");
    if (result.status !== "reset") return;
    expect(await readFile(result.damagedCopy, "utf8")).toBe("garbage");
  });

  it("removes temporary files left by an interrupted write", async () => {
    await writeFile(path.join(dir, "doc.json"), '{"n":1}', "utf8");
    await writeFile(path.join(dir, "doc.json.tmp-4242"), '{"n":', "utf8");
    expect(await new JsonStore(dir, "doc.json", isDoc).load()).toEqual({ status: "ok", value: { n: 1 } });
    expect(await readdir(dir)).toEqual(["doc.json"]);
  });

  it("falls back to the backup when only the backup exists", async () => {
    await writeFile(path.join(dir, "doc.json.bak"), '{"n":7}', "utf8");
    expect(await new JsonStore(dir, "doc.json", isDoc).load()).toEqual({ status: "ok", value: { n: 7 } });
  });
});
