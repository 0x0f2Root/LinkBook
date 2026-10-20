// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { SAMPLE_LIBRARY, type Library } from "@/lib/bookmarks";
import { mergeImport, parseNetscapeBookmarks, toNetscapeBookmarks } from "@/lib/import";

const EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Toolbar</H3>
  <DL><p>
    <DT><H3>Tools &amp; Sites</H3>
    <DL><p>
      <DT><A HREF="https://www.ipvoid.com/" ADD_DATE="1662368919" TAGS="DNS, ip,dns">IPVoid \\\\ All-purposes lookups</A>
      <DT><A HREF="javascript:alert(1)">A bookmarklet</A>
      <DT><A HREF="https://example.org/plain">Plain</A>
    </DL><p>
  </DL><p>
</DL><p>`;

describe("parseNetscapeBookmarks", () => {
  it("reads folders, tags, dates, and split descriptions, and skips bookmarklets", () => {
    const items = parseNetscapeBookmarks(EXPORT);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      url: "https://www.ipvoid.com/",
      title: "IPVoid",
      description: "All-purposes lookups",
      tags: ["dns", "ip"],
      category: "Tools & Sites",
      createdAt: "2022-09-05T09:08:39.000Z",
    });
    expect(items[1]).toMatchObject({ title: "Plain", category: "Tools & Sites", tags: [] });
  });
});

describe("mergeImport", () => {
  it("reuses categories by name, adds new ones, and skips links already saved", () => {
    const items = parseNetscapeBookmarks(EXPORT);
    const first = mergeImport(SAMPLE_LIBRARY, items);
    expect(first.added).toBe(2);
    expect(first.newCategories).toBe(1);
    const again = mergeImport(first.library, [...items, { ...items[0], url: "https://WWW.ipvoid.com" }]);
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(3);
  });
});

describe("toNetscapeBookmarks", () => {
  it("round-trips through the importer", () => {
    const library: Library = {
      categories: [{ id: "c", name: "Reading <& more>", color: "#fff" }],
      bookmarks: [
        { id: "a", url: "https://a.example/?q=1&r=2", title: 'A "quoted" title', description: "With a description", categoryId: "c", tags: ["x", "y"], createdAt: "2026-01-02T03:04:05.000Z" },
        { id: "b", url: "https://b.example/", title: "Orphan", categoryId: "gone", tags: [], createdAt: "2026-01-02T03:04:05.000Z" },
      ],
    };
    const items = parseNetscapeBookmarks(toNetscapeBookmarks(library));
    expect(items).toEqual([
      { url: "https://a.example/?q=1&r=2", title: 'A "quoted" title', description: "With a description", tags: ["x", "y"], category: "Reading <& more>", createdAt: "2026-01-02T03:04:05.000Z" },
      { url: "https://b.example/", title: "Orphan", description: undefined, tags: [], category: "Unsorted", createdAt: "2026-01-02T03:04:05.000Z" },
    ]);
  });
});
