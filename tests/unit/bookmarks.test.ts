import { describe, expect, it, vi } from "vitest";
import { hostname, imageSrc, moveBookmark, parseTags, SAMPLE_LIBRARY, uniqueId } from "@/lib/bookmarks";
import { githubRepo, isStale } from "@/lib/github";

vi.mock("electron", () => ({ nativeImage: {} }));
const { parseImageRequest } = await import("@/main/services/image-cache");

describe("moveBookmark", () => {
  it("moves a card into another column, before a given card", () => {
    const moved = moveBookmark(SAMPLE_LIBRARY, "tailwind", "tools", "excalidraw");
    const tools = moved.bookmarks.filter((bookmark) => bookmark.categoryId === "tools").map((bookmark) => bookmark.id);
    expect(tools).toEqual(["tailwind", "excalidraw", "raycast"]);
  });

  it("appends to the end of the column when no card is given", () => {
    const moved = moveBookmark(SAMPLE_LIBRARY, "mdn", "reading", null);
    expect(moved.bookmarks.filter((bookmark) => bookmark.categoryId === "reading").map((bookmark) => bookmark.id)).toEqual(["great-work", "overreacted", "mdn"]);
  });
});

describe("small helpers", () => {
  it("parses tags", () => expect(parseTags(" React, #docs,react ,, ")).toEqual(["react", "docs"]));
  it("makes unique ids", () => expect(uniqueId("Next.js Docs", [{ id: "next-js-docs" }])).toBe("next-js-docs-2"));
  it("reads hostnames", () => expect(hostname("https://www.github.com/a")).toBe("github.com"));
});

describe("githubRepo", () => {
  it.each([
    ["https://github.com/SigmaHQ/sigma", "SigmaHQ/sigma"],
    ["https://github.com/danielmiessler/SecLists/blob/master/x.csv", "danielmiessler/SecLists"],
    ["https://www.github.com/owner/repo.git", "owner/repo"],
  ])("finds the repo in %s", (url, repo) => expect(githubRepo(url)).toBe(repo));

  it.each(["https://github.com/topics/security", "https://github.com/owner", "https://gitlab.com/a/b", "https://github.com/orgs/x/people"])("ignores %s", (url) => {
    expect(githubRepo(url)).toBeNull();
  });

  it("treats stats older than a day as stale", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    const stats = { fullName: "a/b", stars: 1, forks: 1, openIssues: 0, pushedAt: "", archived: false };
    expect(isStale(undefined, now)).toBe(true);
    expect(isStale({ ...stats, fetchedAt: "2026-10-20T00:00:00Z" }, now)).toBe(false);
    expect(isStale({ ...stats, fetchedAt: "2026-10-18T00:00:00Z" }, now)).toBe(true);
  });
});

describe("lbimg requests (replacement for next/image)", () => {
  it("round-trips the renderer's image URLs", () => {
    expect(parseImageRequest(imageSrc("https://x.example/a.png?b=1", 400))).toEqual({ src: "https://x.example/a.png?b=1", width: 400 });
  });

  it("builds favicon lookups for a domain", () => {
    expect(parseImageRequest("lbimg://favicon/?domain=nextjs.org")?.src).toContain(encodeURIComponent("https://nextjs.org"));
  });

  it.each(["lbimg://image/?src=file:///etc/passwd", "lbimg://image/?src=https://x.example/a.png&w=333", "lbimg://favicon/?domain=../../etc", "lbimg://other/?src=https://x.example"])(
    "rejects %s",
    (url) => expect(parseImageRequest(url)).toBeNull(),
  );
});
