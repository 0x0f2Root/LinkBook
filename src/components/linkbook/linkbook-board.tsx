"use memo";

import { AddCircle, MoonStars, Sun } from "@duo-icons/react";
import { Download, Ellipsis, Hash, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent, type ReactNode, type Ref } from "react";
import {
  DashboardButton,
  DashboardFilterMenu,
  DashboardMenu,
  DashboardMenuContent,
  DashboardMenuItem,
  DashboardMenuTrigger,
  DashboardPopover,
  DashboardPopoverContent,
  DashboardPopoverTrigger,
  DashboardShell,
  type DashboardShellNavSection,
} from "@/components/block/dashboard-shell";
import { BookmarkCard, DRAG_TYPE } from "@/components/linkbook/bookmark-card";
import { BookmarkFormPopover, fieldClassName, type BookmarkDraft } from "@/components/linkbook/bookmark-form";
import { BookmarkIcon } from "@/components/linkbook/bookmark-icon";
import {
  BookmarkGrid,
  BookmarkList,
  BookmarkTable,
  EmptyView,
  ViewSwitcher,
  type Display,
  type SortKey,
  type ViewHandlers,
} from "@/components/linkbook/bookmark-views";
import { fetchGithubStats, githubRepo, isStale } from "@/lib/github";
import { BUNDLED_COLLECTIONS, mergeImport, parseNetscapeBookmarks, toNetscapeBookmarks } from "@/lib/import";
import { LIMITS, type LibraryRecovery } from "@/shared/ipc";
import {
  CATEGORY_COLORS,
  fetchPreview,
  hostname,
  moveBookmark,
  setLibrary,
  uniqueId,
  useDarkMode,
  useHydrated,
  useLibrary,
  onSaveError,
  isOffline,
  useSetting,
  type Bookmark,
  type Category,
  type Library,
} from "@/lib/bookmarks";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; undo?: Library };
type DropTarget = { categoryId: string; beforeId: string | null };

const TABS = [
  { value: "all", label: "All" },
  { value: "pinned", label: "Pinned" },
  { value: "unread", label: "Unread" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
  { value: "title-desc", label: "Title Z–A" },
];

const SIDEBAR_TAG_LIMIT = 8;
/** Columns whose first card is visible on load on a wide screen, so their images skip lazy loading. */
const ABOVE_FOLD_COLUMNS = 4;
const EASE_OUT = [0.25, 1, 0.5, 1] as const;

function sortBookmarks(bookmarks: Bookmark[], key: SortKey) {
  if (key === "manual") return bookmarks;
  return [...bookmarks].sort((a, b) => {
    if (key === "title") return a.title.localeCompare(b.title);
    if (key === "title-desc") return b.title.localeCompare(a.title);
    const diff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return key === "newest" ? -diff : diff;
  });
}

function matchesQuery(bookmark: Bookmark, query: string) {
  if (!query) return true;
  return [bookmark.title, bookmark.url, bookmark.description ?? "", ...bookmark.tags].some((value) => value.toLowerCase().includes(query));
}

export function LinkbookBoard({ recovery = null }: { recovery?: LibraryRecovery | null }) {
  const library = useLibrary();
  const hydrated = useHydrated();
  const [isDark, setDark] = useDarkMode();
  const [view, setView] = useState("all");
  const [tag, setTag] = useState("all");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState<SortKey>("manual");
  const [display, setDisplay] = useSetting("display");
  const [query, setQuery] = useState("");
  // A damaged library file that was recovered at startup is the first thing the board says.
  const [toast, setToast] = useState<Toast | null>(() =>
    recovery
      ? {
          id: 0,
          message:
            recovery.kind === "restored-backup"
              ? "Your library file was damaged, so the last good copy was restored."
              : "Your library file couldn't be read, so LinkBook started fresh. The damaged file was kept in the data folder.",
        }
      : null,
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toastCount = useRef(0);
  const notify = (message: string, undo?: Library) => setToast({ id: ++toastCount.current, message, undo });

  // A change that couldn't be written to disk is worth saying out loud.
  useEffect(() => onSaveError((message) => setToast({ id: Date.now(), message })), []);

  const { categories, bookmarks } = library;

  // Bundled collections are added once. The check runs on the stored library, not this render's copy.
  const collectionsLoading = useRef(new Set<string>());
  useEffect(() => {
    // Waits for the stored library, so a collection already added isn't downloaded again.
    if (!hydrated) return;
    for (const collection of BUNDLED_COLLECTIONS) {
      if (library.imports?.includes(collection.id) || collectionsLoading.current.has(collection.id)) continue;
      collectionsLoading.current.add(collection.id);
      collection.load().then((items) => {
        let added = 0;
        setLibrary((current) => {
          if (current.imports?.includes(collection.id)) return current;
          const result = mergeImport(current, items);
          added = result.added;
          return { ...result.library, imports: [...(current.imports ?? []), collection.id] };
        });
        if (added > 0) notify(`Added ${added} bookmarks from ${collection.name}`);
      });
    }
  }, [hydrated, library.imports]);

  const importHtml = (html: string) => {
    let imported;
    try {
      imported = parseNetscapeBookmarks(html);
    } catch {
      return notify("Couldn't read that file");
    }
    if (imported.length === 0) return notify("No links found. Export bookmarks as HTML and try again");
    const previous = library;
    const result = mergeImport(library, imported);
    setLibrary(result.library);
    notify(
      `Imported ${result.added} bookmark${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already saved` : ""}`,
      result.added ? previous : undefined,
    );
  };

  // The system file picker runs in the main process; the window only receives the chosen file's text.
  const importFromDialog = async () => {
    const result = await window.linkbook.openImportDialog().catch(() => null);
    if (!result) return notify("Couldn't open the file picker");
    if (!result.ok) return notify(result.error);
    if (result.value) importHtml(result.value.html);
  };

  const exportLibrary = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const result = await window.linkbook.saveExport(toNetscapeBookmarks(library), `linkbook-bookmarks-${date}.html`).catch(() => null);
    if (!result) return notify("Couldn't export the bookmarks");
    if (!result.ok) return notify(result.error);
    if (result.value) notify(`Exported ${library.bookmarks.length} bookmarks to ${result.value.path}`);
  };

  // A bookmarks .html file dropped anywhere on the window is imported. Card drags carry no files, so they pass through.
  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      if (!/\.html?$/i.test(file.name)) return setToast({ id: Date.now(), message: "Drop a bookmarks .html file to import it" });
      if (file.size > LIMITS.importBytes) return setToast({ id: Date.now(), message: "That file is larger than 32 MB" });
      void file.text().then(importHtml, () => setToast({ id: Date.now(), message: "Couldn't read that file" }));
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  });

  // Menu items and their shortcuts (File, Edit, View) arrive from the main process.
  const newBookmarkButton = useRef<HTMLButtonElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  useEffect(() =>
    window.linkbook.onMenuCommand((command) => {
      if (command === "new-bookmark") newBookmarkButton.current?.click();
      else if (command === "search") searchButton.current?.click();
      else if (command === "import") void importFromDialog();
      else if (command === "export") void exportLibrary();
      else if (command === "theme:toggle") setDark(!isDark);
      else setDisplay(command.slice("view:".length) as Display);
    }),
  );

  // GitHub repository bookmarks get their stars, forks, and more, refreshed once a day.
  // A repo is asked once per visit; one that failed (missing, private, rate limited) waits for the next visit.
  const statsRequested = useRef(new Set<string>());
  useEffect(() => {
    if (isOffline()) return;
    const now = Date.now();
    for (const bookmark of bookmarks) {
      const repo = githubRepo(bookmark.url);
      if (!repo || !isStale(bookmark.github, now)) continue;
      const key = repo.toLowerCase();
      if (statsRequested.current.has(key)) continue;
      statsRequested.current.add(key);
      fetchGithubStats(repo).then((stats) => {
        if (!stats) return;
        const github = { ...stats, fetchedAt: new Date().toISOString() };
        setLibrary((current) => ({
          ...current,
          // Every bookmark into the same repo (its page, a file, the wiki) shares the stats.
          bookmarks: current.bookmarks.map((item) => (githubRepo(item.url)?.toLowerCase() === key ? { ...item, github } : item)),
        }));
      });
    }
  }, [bookmarks]);

  // Bookmarks saved without an image get one from the page's meta tags, once each.
  const previewsInFlight = useRef(new Set<string>());
  useEffect(() => {
    // Offline, nothing can be looked up, and marking bookmarks as checked would skip them once back online.
    if (isOffline()) return;
    for (const bookmark of bookmarks) {
      if (bookmark.image || bookmark.previewFetched || previewsInFlight.current.has(bookmark.id)) continue;
      previewsInFlight.current.add(bookmark.id);
      fetchPreview(bookmark.url).then((preview) => {
        previewsInFlight.current.delete(bookmark.id);
        setLibrary((current) => ({
          ...current,
          bookmarks: current.bookmarks.map((item) =>
            item.id !== bookmark.id
              ? item
              : {
                  ...item,
                  image: item.image ?? preview?.image,
                  description: item.description ?? preview?.description,
                  // Replaces the domain the form used as a stand-in title, never one you typed.
                  title: item.title === hostname(item.url) && preview?.title ? preview.title : item.title,
                  previewFetched: true,
                },
          ),
        }));
      });
    }
  }, [bookmarks]);

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bookmark of bookmarks) for (const name of bookmark.tags) counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [bookmarks]);

  const search = query.trim().toLowerCase();
  const isFiltered = tag !== "all" || tab !== "all" || search !== "";
  const visible = sortBookmarks(
    bookmarks.filter(
      (bookmark) =>
        (tag === "all" || bookmark.tags.includes(tag)) &&
        (tab === "all" || (tab === "pinned" ? bookmark.pinned : bookmark.unread)) &&
        matchesQuery(bookmark, search),
    ),
    sort,
  );

  const viewCategoryId = view.startsWith("category:") ? view.slice("category:".length) : null;
  const columns = viewCategoryId ? categories.filter((category) => category.id === viewCategoryId) : categories;

  const navigation: DashboardShellNavSection[] = [
    { id: "library", items: [{ id: "all", label: "All bookmarks", icon: BookmarkIcon, count: bookmarks.length }] },
    {
      id: "categories",
      title: "Categories",
      items: categories.map((category) => ({
        id: `category:${category.id}`,
        label: category.name,
        color: category.color,
        count: bookmarks.filter((bookmark) => bookmark.categoryId === category.id).length,
      })),
    },
    {
      id: "tags",
      title: "Tags",
      items: tagCounts.slice(0, SIDEBAR_TAG_LIMIT).map(([name, count]) => ({ id: `tag:${name}`, label: name, icon: Hash, count })),
    },
  ];

  const title = tag !== "all" ? `#${tag}` : viewCategoryId ? (categoryById.get(viewCategoryId)?.name ?? "Category") : "All bookmarks";

  const selectNav = (id: string) => {
    if (id.startsWith("tag:")) {
      setTag(id.slice("tag:".length));
      setView("all");
    } else {
      setView(id);
      setTag("all");
    }
  };

  const clearFilters = () => {
    setTag("all");
    setTab("all");
    setQuery("");
  };

  const updateBookmark = (id: string, change: Partial<Bookmark>) =>
    setLibrary((current) => ({ ...current, bookmarks: current.bookmarks.map((bookmark) => (bookmark.id === id ? { ...bookmark, ...change } : bookmark)) }));

  const addBookmark = (draft: BookmarkDraft) => {
    setLibrary((current) => ({
      ...current,
      // Newest first, so it lands at the top of its column.
      bookmarks: [{ ...draft, id: uniqueId(draft.title, current.bookmarks), unread: true, createdAt: new Date().toISOString() }, ...current.bookmarks],
    }));
    notify(`${draft.title} saved to ${categoryById.get(draft.categoryId)?.name ?? "the board"}`);
  };

  const deleteBookmark = (bookmark: Bookmark) => {
    const previous = library;
    setLibrary((current) => ({ ...current, bookmarks: current.bookmarks.filter((item) => item.id !== bookmark.id) }));
    notify(`${bookmark.title} deleted`, previous);
  };

  const move = (bookmark: Bookmark, categoryId: string, beforeId: string | null = null) => {
    if (bookmark.categoryId === categoryId && beforeId === null && sort !== "manual") return;
    setLibrary((current) => moveBookmark(current, bookmark.id, categoryId, beforeId));
    if (bookmark.categoryId !== categoryId) notify(`Moved to ${categoryById.get(categoryId)?.name}`);
  };

  const copyLink = (bookmark: Bookmark) => {
    if (!navigator.clipboard) return notify("Copying isn't available here");
    navigator.clipboard.writeText(bookmark.url).then(
      () => notify("Link copied"),
      () => notify("Couldn't copy the link"),
    );
  };

  const addCategory = (name: string) => {
    setLibrary((current) => ({
      ...current,
      categories: [...current.categories, { id: uniqueId(name, current.categories), name, color: CATEGORY_COLORS[current.categories.length % CATEGORY_COLORS.length] }],
    }));
    notify(`${name} added`);
  };

  const deleteCategory = (category: Category) => {
    const previous = library;
    setLibrary((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== category.id) }));
    if (viewCategoryId === category.id) setView("all");
    notify(`${category.name} deleted`, previous);
  };

  const dropBookmark = (categoryId: string, beforeId: string | null, id: string) => {
    const bookmark = bookmarks.find((item) => item.id === id);
    if (bookmark) move(bookmark, categoryId, beforeId);
  };

  const unreadCount = bookmarks.filter((bookmark) => bookmark.unread).length;
  const shown = visible.filter((bookmark) => columns.some((column) => column.id === bookmark.categoryId));

  const viewHandlers: ViewHandlers = {
    onOpen: (bookmark) => bookmark.unread && updateBookmark(bookmark.id, { unread: false }),
    onTogglePin: (bookmark) => updateBookmark(bookmark.id, { pinned: !bookmark.pinned }),
    onEdit: (bookmark, draft) => {
      // The same link keeps its lookup; a new one is looked up again if it still has no image.
      updateBookmark(bookmark.id, { ...draft, previewFetched: draft.url === bookmark.url ? bookmark.previewFetched : draft.previewFetched });
      notify("Bookmark updated");
    },
    onMove: (bookmark, categoryId) => move(bookmark, categoryId),
    onCopy: copyLink,
    onDelete: deleteBookmark,
    onTagClick: (name) => setTag((current) => (current === name ? "all" : name)),
  };
  const viewProps = { bookmarks: shown, categories, categoryById, activeTag: tag, handlers: viewHandlers };

  return (
    <div className={cn("h-full w-full", isDark && "dark")}>
      <DashboardShell
        brand={{
          name: "LinkBook",
          description: "Bookmarks",
          // The SVG already has its own squircle and padding, so it sits in the slot as-is.
          logo: <img src="/logo.svg" alt="" width={32} height={32} className="size-8 shrink-0" />,
        }}
        navigation={navigation}
        sidebarFooter={<LibraryStats bookmarks={bookmarks.length} tags={tagCounts.length} unread={unreadCount} />}
        activeItemId={tag !== "all" ? `tag:${tag}` : view}
        onActiveItemChange={selectNav}
        title={title}
        status={`${shown.length} shown`}
        statusTone="neutral"
        headerActions={
          <>
            <SearchButton query={query} onQueryChange={setQuery} buttonRef={searchButton} />
            <DashboardButton variant="secondary" size="icon" aria-label={isDark ? "Use light theme" : "Use dark theme"} onClick={() => setDark(!isDark)}>
              {isDark ? <Sun aria-hidden /> : <MoonStars aria-hidden />}
            </DashboardButton>
          </>
        }
        tabs={TABS}
        tab={tab}
        onTabChange={setTab}
        filters={
          <>
            <ViewSwitcher value={display} onChange={setDisplay} />
            <DashboardFilterMenu label="Sort by" value={sort} options={SORT_OPTIONS} onValueChange={(value) => setSort(value as SortKey)} />
            <DashboardFilterMenu
              label="Tag"
              value={tag}
              options={[{ value: "all", label: "All tags" }, ...tagCounts.map(([name]) => ({ value: name, label: `#${name}` }))]}
              onValueChange={setTag}
            />
            {isFiltered && (
              <DashboardButton variant="ghost" size="sm" onClick={clearFilters}>
                <X aria-hidden />
                Clear
              </DashboardButton>
            )}
          </>
        }
        toolbarActions={
          <>
            <DashboardButton variant="secondary" size="sm" onClick={() => void importFromDialog()} title="Import a bookmarks .html file (Ctrl+O), or drop one on the window">
              <Upload aria-hidden />
              Import
            </DashboardButton>
            <DashboardButton variant="secondary" size="sm" onClick={() => void exportLibrary()} title="Export all bookmarks as an .html file (Ctrl+Shift+E)">
              <Download aria-hidden />
              Export
            </DashboardButton>
            {categories.length > 0 && (
              <BookmarkFormPopover categories={categories} defaultCategoryId={viewCategoryId ?? undefined} onSubmit={addBookmark}>
                <DashboardButton ref={newBookmarkButton} variant="primary" size="sm">
                  <AddCircle aria-hidden />
                  New bookmark
                </DashboardButton>
              </BookmarkFormPopover>
            )}
          </>
        }
      >
        <div className="flex min-h-full flex-col">
          {display === "board" || !hydrated ? (
            <div
              className="grid grid-cols-[repeat(auto-fill,minmax(288px,1fr))] items-start gap-3 p-3"
              onDragEnd={() => {
                setDraggingId(null);
                setDropTarget(null);
              }}
            >
              {!hydrated && <BoardSkeleton />}
              {columns.map((category, columnIndex) => (
                <BoardColumn
                  key={category.id}
                  isAboveFold={columnIndex < ABOVE_FOLD_COLUMNS}
                  category={category}
                  categories={categories}
                  bookmarks={visible.filter((bookmark) => bookmark.categoryId === category.id)}
                  total={bookmarks.filter((bookmark) => bookmark.categoryId === category.id).length}
                  isFiltered={isFiltered}
                  activeTag={tag}
                  draggingId={draggingId}
                  dropTarget={dropTarget?.categoryId === category.id ? dropTarget : null}
                  onDropTargetChange={setDropTarget}
                  onDrop={dropBookmark}
                  onAdd={addBookmark}
                  onDeleteCategory={deleteCategory}
                  cardHandlers={{
                    ...viewHandlers,
                    onDragStart: setDraggingId,
                    onDragEnd: () => {
                      setDraggingId(null);
                      setDropTarget(null);
                    },
                  }}
                />
              ))}
              {hydrated && !viewCategoryId && <AddCategoryColumn onAdd={addCategory} />}
            </div>
          ) : shown.length === 0 ? (
            <EmptyView
              title={isFiltered ? "No bookmarks match" : "No bookmarks here yet"}
              detail={isFiltered ? "Try another tab, tag, or search." : "Add one with New bookmark, or import a bookmarks file."}
              action={isFiltered ? { label: "Clear filters", onClick: clearFilters } : undefined}
            />
          ) : display === "grid" ? (
            <BookmarkGrid {...viewProps} />
          ) : display === "table" ? (
            <BookmarkTable {...viewProps} sort={sort} onSortChange={setSort} />
          ) : (
            <BookmarkList {...viewProps} />
          )}

          <div role="status" className="pointer-events-none sticky bottom-3 z-10 mt-auto flex justify-center px-3">
            <AnimatePresence mode="popLayout">
              {toast && (
                <FloatingBar key={toast.id}>
                  <span className="px-2 text-xs">{toast.message}</span>
                  {toast.undo && (
                    <DashboardButton
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setLibrary(toast.undo!);
                        setToast(null);
                      }}
                    >
                      Undo
                    </DashboardButton>
                  )}
                </FloatingBar>
              )}
            </AnimatePresence>
          </div>
        </div>
      </DashboardShell>
    </div>
  );
}

type CardHandlers = Pick<
  Parameters<typeof BookmarkCard>[0],
  "onDragStart" | "onDragEnd" | "onOpen" | "onTogglePin" | "onEdit" | "onMove" | "onCopy" | "onDelete" | "onTagClick"
>;

type BoardColumnProps = {
  category: Category;
  isAboveFold: boolean;
  categories: Category[];
  bookmarks: Bookmark[];
  /** All bookmarks in the category, ignoring filters. */
  total: number;
  isFiltered: boolean;
  activeTag: string;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  onDropTargetChange: (target: DropTarget | null) => void;
  onDrop: (categoryId: string, beforeId: string | null, id: string) => void;
  onAdd: (draft: BookmarkDraft) => void;
  onDeleteCategory: (category: Category) => void;
  cardHandlers: CardHandlers;
};

function BoardColumn({
  category,
  isAboveFold,
  categories,
  bookmarks,
  total,
  isFiltered,
  activeTag,
  draggingId,
  dropTarget,
  onDropTargetChange,
  onDrop,
  onAdd,
  onDeleteCategory,
  cardHandlers,
}: BoardColumnProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // The drop lands before the first card whose middle is below the pointer.
  const targetFor = (clientY: number): DropTarget => {
    const cards = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-bookmark-id]") ?? [])].filter((card) => card.dataset.bookmarkId !== draggingId);
    const before = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });
    return { categoryId: category.id, beforeId: before?.dataset.bookmarkId ?? null };
  };

  const handleDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const next = targetFor(event.clientY);
    if (next.categoryId !== dropTarget?.categoryId || next.beforeId !== dropTarget?.beforeId) onDropTargetChange(next);
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    const id = event.dataTransfer.getData(DRAG_TYPE);
    if (!id) return;
    event.preventDefault();
    onDrop(category.id, targetFor(event.clientY).beforeId, id);
    onDropTargetChange(null);
  };

  const indicator = <li aria-hidden className="h-0.5 shrink-0 rounded-full bg-(--obsidian-dashboard-shell-accent)" />;

  return (
    <section
      aria-label={category.name}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onDropTargetChange(null);
      }}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-hover) transition-colors duration-150",
        dropTarget && "border-(--obsidian-dashboard-shell-accent)",
      )}
    >
      <header className="flex items-center gap-2 py-2 pl-3 pr-1.5">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
        <h2 className="truncate text-xs font-medium">{category.name}</h2>
        <span className="rounded-md bg-(--obsidian-dashboard-shell-muted) px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-(--obsidian-dashboard-shell-text-muted)">
          {isFiltered ? `${bookmarks.length}/${total}` : total}
        </span>
        <div className="ml-auto flex items-center">
          <BookmarkFormPopover categories={categories} defaultCategoryId={category.id} onSubmit={onAdd} align="start">
            <DashboardButton variant="ghost" size="icon" aria-label={`Add bookmark to ${category.name}`}>
              <Plus aria-hidden />
            </DashboardButton>
          </BookmarkFormPopover>
          <DashboardMenu>
            <DashboardMenuTrigger asChild>
              <DashboardButton variant="ghost" size="icon" aria-label={`${category.name} options`}>
                <Ellipsis aria-hidden />
              </DashboardButton>
            </DashboardMenuTrigger>
            <DashboardMenuContent align="end">
              <DashboardMenuItem disabled={total > 0} onSelect={() => onDeleteCategory(category)} className="text-(--obsidian-dashboard-shell-danger)">
                <Trash2 aria-hidden />
                {total > 0 ? "Empty it to delete" : "Delete category"}
              </DashboardMenuItem>
            </DashboardMenuContent>
          </DashboardMenu>
        </div>
      </header>

      <ul ref={listRef} className="flex min-h-16 flex-col gap-2 px-2 pb-2">
        {bookmarks.map((bookmark, index) => (
          <BoardItem key={bookmark.id} showIndicator={dropTarget?.beforeId === bookmark.id} indicator={indicator}>
            <BookmarkCard
              bookmark={bookmark}
              category={category}
              categories={categories}
              activeTag={activeTag}
              isDragging={draggingId === bookmark.id}
              priority={isAboveFold && index === 0}
              {...cardHandlers}
            />
          </BoardItem>
        ))}
        {dropTarget && dropTarget.beforeId === null && indicator}
        {bookmarks.length === 0 && !dropTarget && (
          <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-(--obsidian-dashboard-shell-border-strong) px-3 py-6 text-center text-xs text-(--obsidian-dashboard-shell-text-subtle)">
            {isFiltered && total > 0 ? "No bookmarks match" : "Drop bookmarks here"}
          </li>
        )}
      </ul>
    </section>
  );
}

function BoardItem({ children, showIndicator, indicator }: { children: ReactNode; showIndicator: boolean; indicator: ReactNode }) {
  return (
    <>
      {showIndicator && indicator}
      {/* Off-screen cards skip layout and paint until they scroll near, which keeps long columns fast. */}
      <li className="[contain-intrinsic-size:auto_380px] [content-visibility:auto]">{children}</li>
    </>
  );
}

function BoardSkeleton() {
  return (
    <>
      {[3, 2, 2].map((cards, column) => (
        <div key={column} aria-hidden className="flex flex-col gap-2 rounded-xl border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-hover) p-2">
          <div className="mx-1 my-1.5 h-3 w-24 animate-pulse rounded bg-(--obsidian-dashboard-shell-muted)" />
          {Array.from({ length: cards }, (_, card) => (
            <div key={card} className="overflow-hidden rounded-lg bg-(--obsidian-dashboard-shell-control) shadow-(--obsidian-dashboard-shell-control-shadow)">
              <div className="aspect-[16/9] animate-pulse bg-(--obsidian-dashboard-shell-muted)" />
              <div className="flex flex-col gap-2 p-3">
                <div className="h-2.5 w-20 animate-pulse rounded bg-(--obsidian-dashboard-shell-muted)" />
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-(--obsidian-dashboard-shell-muted)" />
                <div className="h-2.5 w-full animate-pulse rounded bg-(--obsidian-dashboard-shell-muted)" />
              </div>
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only">Loading bookmarks</span>
    </>
  );
}

function AddCategoryColumn({ onAdd }: { onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim()) onAdd(name.trim());
    setName("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-(--obsidian-dashboard-shell-border-strong) px-3 text-xs text-(--obsidian-dashboard-shell-text-muted) outline-none transition-colors duration-150 hover:bg-(--obsidian-dashboard-shell-hover) hover:text-(--obsidian-dashboard-shell-foreground) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)"
      >
        <Plus aria-hidden className="size-4" />
        Add category
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-xl border border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-hover) p-2">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setEditing(false)}
        placeholder="Category name"
        aria-label="Category name"
        className={fieldClassName}
      />
      <div className="flex justify-end gap-2">
        <DashboardButton variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </DashboardButton>
        <DashboardButton variant="primary" size="sm" type="submit" disabled={!name.trim()}>
          Add
        </DashboardButton>
      </div>
    </form>
  );
}

function LibraryStats({ bookmarks, tags, unread }: { bookmarks: number; tags: number; unread: number }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-xs leading-none">
      {[
        ["Saved", bookmarks],
        ["Tags", tags],
        ["Unread", unread],
      ].map(([label, value]) => (
        <div key={label} className="flex flex-col-reverse gap-1.5">
          <dt className="text-[11px] text-(--obsidian-dashboard-shell-text-subtle)">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SearchButton({ query, onQueryChange, buttonRef }: { query: string; onQueryChange: (value: string) => void; buttonRef: Ref<HTMLButtonElement> }) {
  return (
    <DashboardPopover>
      <DashboardPopoverTrigger asChild>
        <DashboardButton ref={buttonRef} variant="secondary" size="icon" aria-label="Search bookmarks (Ctrl+F)" className="relative">
          <Search aria-hidden />
          {query && <span aria-hidden className="absolute right-[6px] top-[6px] size-1.5 rounded-full bg-(--obsidian-dashboard-shell-accent)" />}
        </DashboardButton>
      </DashboardPopoverTrigger>
      <DashboardPopoverContent align="end" className="w-64">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-(--obsidian-dashboard-shell-text-subtle)" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Title, URL, or tag"
            aria-label="Search bookmarks"
            className={cn(fieldClassName, "pl-8")}
          />
        </div>
      </DashboardPopoverContent>
    </DashboardPopover>
  );
}

function FloatingBar({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98, filter: "blur(2px)" }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-(--obsidian-dashboard-shell-menu) p-1 text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-menu-shadow) backdrop-blur-xl backdrop-saturate-150"
    >
      {children}
    </motion.div>
  );
}
