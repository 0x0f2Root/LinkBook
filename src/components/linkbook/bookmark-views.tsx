"use memo";

import { ArrowDown, ArrowUp, ChevronsUpDown, LayoutGrid, List, SquareKanban, Table2, type LucideIcon } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { DashboardButton } from "@/components/block/dashboard-shell";
import { BookmarkActions, BookmarkCard, CategoryLabel, Favicon, TagList, savedDate } from "@/components/linkbook/bookmark-card";
import { GithubStatsRow } from "@/components/linkbook/github-stats";
import { hostname, imageSrc, usableImage, type Bookmark, type Category } from "@/lib/bookmarks";
import { cn } from "@/lib/utils";

// One list for the switcher, the saved setting, and the View menu.
export { DISPLAYS, type Display } from "@/shared/ipc";
import type { Display } from "@/shared/ipc";

const DISPLAY_OPTIONS: { value: Display; label: string; icon: LucideIcon }[] = [
  { value: "board", label: "Board", icon: SquareKanban },
  { value: "grid", label: "Grid", icon: LayoutGrid },
  { value: "table", label: "Table", icon: Table2 },
  { value: "list", label: "List", icon: List },
];

export type SortKey = "manual" | "newest" | "oldest" | "title" | "title-desc";

type CardProps = Parameters<typeof BookmarkCard>[0];
export type ViewHandlers = Pick<CardProps, "onOpen" | "onTogglePin" | "onEdit" | "onMove" | "onCopy" | "onDelete" | "onTagClick">;

type ViewProps = {
  bookmarks: Bookmark[];
  categories: Category[];
  categoryById: Map<string, Category>;
  activeTag: string;
  handlers: ViewHandlers;
};

/** Grid cards above the fold on a wide screen, so their images skip lazy loading. */
const GRID_PRIORITY_CARDS = 8;
const noop = () => {};

export function ViewSwitcher({ value, onChange }: { value: Display; onChange: (value: Display) => void }) {
  return (
    <div role="radiogroup" aria-label="View" className="flex items-center gap-0.5 rounded-md bg-(--obsidian-dashboard-shell-muted) p-0.5">
      {DISPLAY_OPTIONS.map(({ value: option, label, icon: Icon }) => {
        const checked = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            onClick={() => onChange(option)}
            className={cn(
              "grid h-6 w-7 cursor-pointer place-items-center rounded-[5px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)",
              checked
                ? "bg-(--obsidian-dashboard-shell-control) text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-control-shadow)"
                : "text-(--obsidian-dashboard-shell-text-subtle) hover:text-(--obsidian-dashboard-shell-foreground)",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

export function BookmarkGrid({ bookmarks, categories, categoryById, activeTag, handlers }: ViewProps) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] items-start gap-3 p-3">
      {bookmarks.map((bookmark, index) => (
        <li key={bookmark.id} className="[contain-intrinsic-size:auto_380px] [content-visibility:auto]">
          <BookmarkCard
            bookmark={bookmark}
            category={categoryById.get(bookmark.categoryId)}
            categories={categories}
            activeTag={activeTag}
            isDragging={false}
            draggable={false}
            showCategory
            priority={index < GRID_PRIORITY_CARDS}
            onDragStart={noop}
            onDragEnd={noop}
            {...handlers}
          />
        </li>
      ))}
    </ul>
  );
}

const cell = "px-3 py-2 align-middle";
// Columns drop out one by one as the content area narrows, so the table fits a phone without scrolling sideways.
const hideBelow = { sm: "hidden @sm/table:table-cell", md: "hidden @2xl/table:table-cell", lg: "hidden @4xl/table:table-cell" };

export function BookmarkTable({ bookmarks, categories, categoryById, activeTag, handlers, sort, onSortChange }: ViewProps & { sort: SortKey; onSortChange: (sort: SortKey) => void }) {
  return (
    <div className="@container/table">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-[1] bg-(--obsidian-dashboard-shell-background)">
          <tr className="border-b border-(--obsidian-dashboard-shell-border) text-xs text-(--obsidian-dashboard-shell-text-subtle)">
            <th scope="col" className={cn(cell, hideBelow.sm, "w-[88px] pl-4 font-normal")}>
              <span className="sr-only">Preview</span>
            </th>
            <SortHeader
              label="Title"
              active={sort === "title" || sort === "title-desc"}
              ascending={sort !== "title-desc"}
              onClick={() => onSortChange(sort === "title" ? "title-desc" : "title")}
            />
            <th scope="col" className={cn(cell, hideBelow.md, "font-normal")}>
              Category
            </th>
            <th scope="col" className={cn(cell, hideBelow.lg, "font-normal")}>
              Tags
            </th>
            <SortHeader
              label="Saved"
              active={sort === "newest" || sort === "oldest"}
              ascending={sort === "oldest"}
              onClick={() => onSortChange(sort === "newest" ? "oldest" : "newest")}
              className={hideBelow.sm}
            />
            <th scope="col" className="w-px py-2 pr-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {bookmarks.map((bookmark) => (
            <tr
              key={bookmark.id}
              className="group/item border-b border-(--obsidian-dashboard-shell-border) transition-colors duration-150 last:border-b-0 hover:bg-(--obsidian-dashboard-shell-hover)"
            >
              <td className={cn(cell, hideBelow.sm, "pl-4")}>
                <a href={bookmark.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden onClick={() => handlers.onOpen(bookmark)}>
                  <Thumbnail bookmark={bookmark} color={categoryById.get(bookmark.categoryId)?.color} />
                </a>
              </td>
              {/* Takes the leftover width; max-w-0 lets the title truncate instead of widening the table. */}
              <td className={cn(cell, "w-full max-w-0")}>
                <TitleCell bookmark={bookmark} onOpen={handlers.onOpen} />
              </td>
              <td className={cn(cell, hideBelow.md, "max-w-48 whitespace-nowrap text-xs text-(--obsidian-dashboard-shell-text-muted)")}>
                <CategoryLabel category={categoryById.get(bookmark.categoryId)} />
              </td>
              <td className={cn(cell, hideBelow.lg)}>
                <TagList tags={bookmark.tags} activeTag={activeTag} onTagClick={handlers.onTagClick} limit={3} className="flex-nowrap" />
              </td>
              <td className={cn(cell, hideBelow.sm, "whitespace-nowrap text-xs tabular-nums text-(--obsidian-dashboard-shell-text-muted)")}>
                <time dateTime={bookmark.createdAt}>{savedDate.format(new Date(bookmark.createdAt))}</time>
              </td>
              <td className="py-2 pr-2 align-middle">
                <div className="flex items-center justify-end gap-0.5">
                  <BookmarkActions bookmark={bookmark} categories={categories} {...handlers} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BookmarkList({ bookmarks, categories, activeTag, handlers }: ViewProps) {
  // Grouped by category, in board order, so the list reads like the board laid flat.
  const groups = categories
    .map((category) => ({ category, items: bookmarks.filter((bookmark) => bookmark.categoryId === category.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="@container/list flex flex-col gap-4 p-3">
      {groups.map(({ category, items }) => (
        <section key={category.id} aria-label={category.name} className="overflow-hidden rounded-xl border border-(--obsidian-dashboard-shell-border)">
          <header className="flex items-center gap-2 border-b border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-hover) px-3 py-2">
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
            <h2 className="truncate text-xs font-medium">{category.name}</h2>
            <span className="rounded-md bg-(--obsidian-dashboard-shell-muted) px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-(--obsidian-dashboard-shell-text-muted)">
              {items.length}
            </span>
          </header>
          <ul className="divide-y divide-(--obsidian-dashboard-shell-border)">
            {items.map((bookmark) => (
              <li
                key={bookmark.id}
                className="group/item flex items-center gap-3 px-3 py-2 transition-colors duration-150 [contain-intrinsic-size:auto_52px] [content-visibility:auto] hover:bg-(--obsidian-dashboard-shell-hover)"
              >
                <div className="min-w-0 flex-1">
                  <TitleCell bookmark={bookmark} onOpen={handlers.onOpen} showDescription />
                </div>
                <TagList tags={bookmark.tags} activeTag={activeTag} onTagClick={handlers.onTagClick} limit={3} className="hidden shrink-0 flex-nowrap @2xl/list:flex" />
                <time dateTime={bookmark.createdAt} className="hidden w-14 shrink-0 text-right text-xs tabular-nums text-(--obsidian-dashboard-shell-text-subtle) @md/list:block">
                  {savedDate.format(new Date(bookmark.createdAt))}
                </time>
                <div className="flex shrink-0 items-center gap-0.5">
                  <BookmarkActions bookmark={bookmark} categories={categories} {...handlers} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function EmptyView({ title, detail, action }: { title: string; detail: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-(--obsidian-dashboard-shell-text-subtle)">{detail}</p>
      </div>
      {action && (
        <DashboardButton variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </DashboardButton>
      )}
    </div>
  );
}

function TitleCell({ bookmark, onOpen, showDescription = false }: { bookmark: Bookmark; onOpen: (bookmark: Bookmark) => void; showDescription?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Favicon url={bookmark.url} className="size-4" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onOpen(bookmark)}
            className="truncate rounded-sm font-medium leading-tight outline-none hover:underline focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)"
          >
            {bookmark.title}
          </a>
          {bookmark.unread && <span aria-label="Unread" role="img" className="size-1.5 shrink-0 rounded-full bg-(--obsidian-dashboard-shell-accent)" />}
        </span>
        {bookmark.github ? (
          // The repo's stats say more than its domain, which is always github.com.
          <GithubStatsRow stats={bookmark.github} compact className="flex-nowrap overflow-hidden" />
        ) : (
          <span className="truncate text-[11px] leading-tight text-(--obsidian-dashboard-shell-text-subtle)">
            {showDescription && bookmark.description ? `${hostname(bookmark.url)} · ${bookmark.description}` : hostname(bookmark.url)}
          </span>
        )}
      </div>
    </div>
  );
}

function Thumbnail({ bookmark, color = "#8b8b8b" }: { bookmark: Bookmark; color?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const frame = (children: ReactNode, style?: CSSProperties) => (
    <span className="relative flex aspect-[16/9] w-16 items-center justify-center overflow-hidden rounded-md bg-(--obsidian-dashboard-shell-muted)" style={style}>
      {children}
    </span>
  );

  const image = usableImage(bookmark);
  if (image && failedSrc !== image) {
    return frame(
      <img
        src={imageSrc(image, 64)}
        srcSet={`${imageSrc(image, 64)} 1x, ${imageSrc(image, 128)} 2x`}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(image)}
        className="absolute inset-0 size-full object-cover"
      />,
    );
  }
  return frame(<Favicon url={bookmark.url} className="size-4" />, { backgroundImage: `radial-gradient(circle at 30% 20%, ${color}55, transparent 70%)` });
}

function SortHeader({ label, active, ascending, onClick, className }: { label: string; active: boolean; ascending: boolean; onClick: () => void; className?: string }) {
  const Icon = !active ? ChevronsUpDown : ascending ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (ascending ? "ascending" : "descending") : undefined} className={cn(cell, "font-normal", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "-mx-1.5 inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 outline-none transition-colors duration-150 hover:bg-(--obsidian-dashboard-shell-muted) hover:text-(--obsidian-dashboard-shell-foreground) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)",
          active && "text-(--obsidian-dashboard-shell-foreground)",
        )}
      >
        {label}
        <Icon aria-hidden className={cn("size-3", !active && "opacity-60")} />
      </button>
    </th>
  );
}
