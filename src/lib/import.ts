import { CATEGORY_COLORS, uniqueId, type Bookmark, type Library } from "@/lib/bookmarks";

/** A bookmark read from an export, before it has an id or belongs to a category on the board. */
export type ImportedBookmark = {
  url: string;
  title: string;
  description?: string;
  tags: string[];
  /** Name of the folder it was in. Becomes a category. */
  category: string;
  createdAt: string;
};

export type ImportResult = { library: Library; added: number; skipped: number; newCategories: number };

/** Folders and links from a browser or Linkwarden bookmarks export (the Netscape bookmark file format). */
export function parseNetscapeBookmarks(html: string): ImportedBookmark[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const bookmarks: ImportedBookmark[] = [];
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const url = anchor.getAttribute("href") ?? "";
    // Bookmarklets and file links aren't pages, so they don't belong on the board.
    if (!/^https?:\/\//i.test(url)) continue;

    // Each folder is a <DT> holding its <H3> name and a <DL> of its contents.
    const folder = anchor.closest("dl")?.parentElement?.querySelector(":scope > h3")?.textContent?.trim();
    const text = anchor.textContent?.replace(/\s+/g, " ").trim() ?? "";
    // Some exports pack "Name \\ what it is" into the title.
    const [title, ...rest] = text.split(/\s+\\\\\s+/);
    const added = Number(anchor.getAttribute("add_date"));

    bookmarks.push({
      url,
      title: title || url,
      description: rest.join(" ").trim() || undefined,
      tags: [...new Set((anchor.getAttribute("tags") ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))],
      category: folder || "Imported",
      createdAt: added > 0 ? new Date(added * 1000).toISOString() : new Date().toISOString(),
    });
  }
  return bookmarks;
}

/** Same page, ignoring a trailing slash and the host's case. */
function urlKey(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return url;
  }
}

/** Adds imported bookmarks to the library, reusing categories by name and skipping links already saved. */
export function mergeImport(library: Library, imported: ImportedBookmark[]): ImportResult {
  const categories = [...library.categories];
  const bookmarks = [...library.bookmarks];
  const seen = new Set(bookmarks.map((bookmark) => urlKey(bookmark.url)));
  const categoryIdByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
  let added = 0;
  let newCategories = 0;

  for (const item of imported) {
    const key = urlKey(item.url);
    if (seen.has(key)) continue;
    seen.add(key);

    let categoryId = categoryIdByName.get(item.category.toLowerCase());
    if (!categoryId) {
      categoryId = uniqueId(item.category, categories);
      categories.push({ id: categoryId, name: item.category, color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] });
      categoryIdByName.set(item.category.toLowerCase(), categoryId);
      newCategories += 1;
    }

    const bookmark: Bookmark = {
      id: uniqueId(item.title, bookmarks),
      url: item.url,
      title: item.title,
      description: item.description,
      categoryId,
      tags: item.tags,
      createdAt: item.createdAt,
    };
    bookmarks.push(bookmark);
    added += 1;
  }

  return { library: { ...library, categories, bookmarks }, added, skipped: imported.length - added, newCategories };
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The library as a Netscape bookmarks file, the format every browser and Linkwarden import.
 * Categories become folders; descriptions ride in the title after " \\ ", which parseNetscapeBookmarks reads back.
 */
export function toNetscapeBookmarks(library: Library) {
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>Bookmarks</TITLE>",
    "<H1>LinkBook</H1>",
    "<DL><p>",
  ];
  const known = new Set(library.categories.map((category) => category.id));
  const folders = [
    ...library.categories.map((category) => ({ name: category.name, items: library.bookmarks.filter((bookmark) => bookmark.categoryId === category.id) })),
    { name: "Unsorted", items: library.bookmarks.filter((bookmark) => !known.has(bookmark.categoryId)) },
  ].filter((folder) => folder.items.length > 0);

  for (const folder of folders) {
    lines.push(`    <DT><H3>${escapeHtml(folder.name)}</H3>`, "    <DL><p>");
    for (const bookmark of folder.items) {
      const added = Math.floor(Date.parse(bookmark.createdAt) / 1000);
      const text = bookmark.description ? `${bookmark.title} \\\\ ${bookmark.description}` : bookmark.title;
      const attributes = [`HREF="${escapeHtml(bookmark.url)}"`, Number.isFinite(added) ? `ADD_DATE="${added}"` : "", bookmark.tags.length ? `TAGS="${escapeHtml(bookmark.tags.join(","))}"` : ""]
        .filter(Boolean)
        .join(" ");
      lines.push(`        <DT><A ${attributes}>${escapeHtml(text)}</A>`);
    }
    lines.push("    </DL><p>");
  }
  lines.push("</DL><p>", "");
  return lines.join("\n");
}

/** Collections that ship with Linkbook and are added once to every library. */
export const BUNDLED_COLLECTIONS = [
  {
    id: "awesome-cybersecurity-bookmarks",
    name: "Awesome Cybersecurity Bookmarks",
    source: "https://github.com/hRun/awesome-cybersecurity-bookmarks",
    // Loaded on demand, so the list doesn't weigh down the page script.
    load: () => import("@/data/awesome-cybersecurity-bookmarks.json").then((module) => module.default as ImportedBookmark[]),
  },
];
