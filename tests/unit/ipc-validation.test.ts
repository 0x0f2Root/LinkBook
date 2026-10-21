import { describe, expect, it } from "vitest";
import { SAMPLE_LIBRARY } from "../fixtures/sample-library";
import { GITHUB_REPO, isHttpUrl, isLibrary, isSettingsPatch } from "@/shared/ipc";

describe("isHttpUrl", () => {
  it("accepts http and https links", () => {
    expect(isHttpUrl("https://example.com/a?b=c")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "app://linkbook/index.html", "ftp://x.org", "not a url", "", 42, null, undefined, {}])(
    "rejects %s",
    (value) => expect(isHttpUrl(value)).toBe(false),
  );

  it("rejects absurdly long input", () => {
    expect(isHttpUrl(`https://example.com/${"a".repeat(5000)}`)).toBe(false);
  });
});

describe("isSettingsPatch", () => {
  it("accepts a known theme or view", () => {
    expect(isSettingsPatch({ theme: "dark" })).toBe(true);
    expect(isSettingsPatch({ display: "table", theme: "system" })).toBe(true);
  });

  it.each([{}, { theme: "neon" }, { display: "kanban" }, { window: { x: 0, y: 0, width: 1, height: 1, maximized: false } }, { theme: "dark", extra: 1 }, [], null, "dark"])(
    "rejects %j",
    (value) => expect(isSettingsPatch(value)).toBe(false),
  );
});

describe("isLibrary", () => {
  it("accepts the sample library", () => {
    expect(isLibrary(SAMPLE_LIBRARY)).toBe(true);
  });

  it("rejects malformed libraries", () => {
    expect(isLibrary(null)).toBe(false);
    expect(isLibrary({ categories: [] })).toBe(false);
    expect(isLibrary({ categories: [], bookmarks: [{ id: "a" }] })).toBe(false);
    expect(isLibrary({ categories: [{ id: 1, name: "x", color: "#fff" }], bookmarks: [] })).toBe(false);
    const badTags = { ...SAMPLE_LIBRARY, bookmarks: [{ ...SAMPLE_LIBRARY.bookmarks[0], tags: [1] }] };
    expect(isLibrary(badTags)).toBe(false);
    const hugeTitle = { ...SAMPLE_LIBRARY, bookmarks: [{ ...SAMPLE_LIBRARY.bookmarks[0], title: "x".repeat(3000) }] };
    expect(isLibrary(hugeTitle)).toBe(false);
  });
});

describe("GITHUB_REPO", () => {
  it("matches owner/name", () => {
    expect(GITHUB_REPO.test("linkwarden/linkwarden")).toBe(true);
    expect(GITHUB_REPO.test("SigmaHQ/sigma")).toBe(true);
    expect(GITHUB_REPO.test("a-b/c.d_e")).toBe(true);
  });

  it.each(["../../etc", "owner", "owner/name/extra", "-bad/name", "owner/na me", "owner/name?x=1"])("rejects %s", (value) => {
    expect(GITHUB_REPO.test(value)).toBe(false);
  });
});
