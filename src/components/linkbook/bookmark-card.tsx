"use memo";

import { Copy, Ellipsis, ExternalLink, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import {
  DashboardButton,
  DashboardMenu,
  DashboardMenuContent,
  DashboardMenuItem,
  DashboardMenuLabel,
  DashboardMenuRadioGroup,
  DashboardMenuRadioItem,
  DashboardMenuSeparator,
  DashboardMenuTrigger,
} from "@/components/block/dashboard-shell";
import { BookmarkFormPopover, type BookmarkDraft } from "@/components/linkbook/bookmark-form";
import { GithubStatsRow } from "@/components/linkbook/github-stats";
import { faviconUrl, hostname, imageSrc, usableImage, type Bookmark, type Category } from "@/lib/bookmarks";
import { cn } from "@/lib/utils";

export const DRAG_TYPE = "application/x-linkbook-bookmark";

// UTC keeps the server and browser render identical.
export const savedDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

type BookmarkCardProps = {
  bookmark: Bookmark;
  category?: Category;
  categories: Category[];
  activeTag: string;
  isDragging: boolean;
  /** Loads the preview image right away instead of when it scrolls into view, for cards above the fold. */
  priority?: boolean;
  /** Off where there's no column to drop into, such as the grid. */
  draggable?: boolean;
  /** Shows which category it's in, for views that don't group by category. */
  showCategory?: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOpen: (bookmark: Bookmark) => void;
  onTogglePin: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark, draft: BookmarkDraft) => void;
  onMove: (bookmark: Bookmark, categoryId: string) => void;
  onCopy: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onTagClick: (tag: string) => void;
};

export function BookmarkCard({
  bookmark,
  category,
  categories,
  activeTag,
  isDragging,
  priority = false,
  draggable = true,
  showCategory = false,
  onDragStart,
  onDragEnd,
  onOpen,
  onTogglePin,
  onEdit,
  onMove,
  onCopy,
  onDelete,
  onTagClick,
}: BookmarkCardProps) {
  const domain = hostname(bookmark.url);

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(DRAG_TYPE, bookmark.id);
    event.dataTransfer.setData("text/uri-list", bookmark.url);
    event.dataTransfer.effectAllowed = "move";
    onDragStart(bookmark.id);
  };

  return (
    <article
      data-bookmark-id={bookmark.id}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      aria-label={bookmark.title}
      className={cn(
        "group/item flex flex-col overflow-hidden rounded-lg bg-(--obsidian-dashboard-shell-control) shadow-(--obsidian-dashboard-shell-control-shadow) transition-[opacity,box-shadow] duration-150",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    >
      <a href={bookmark.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden draggable={false} onClick={() => onOpen(bookmark)}>
        <BookmarkCover bookmark={bookmark} color={category?.color} priority={priority} />
      </a>

      {/* Every section has a fixed height, reserved even when empty, so all cards are the same size. */}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex h-3.5 min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] leading-none text-(--obsidian-dashboard-shell-text-subtle)">
          <Favicon url={bookmark.url} className="size-3.5" />
          <span className="truncate">{domain}</span>
          {showCategory && (
            <>
              <span aria-hidden>·</span>
              <CategoryLabel category={category} />
            </>
          )}
          {bookmark.unread && (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-(--obsidian-dashboard-shell-accent)">
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              Unread
            </span>
          )}
        </div>

        <h3 className="h-[2lh] text-sm font-medium leading-snug">
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            draggable={false}
            onClick={() => onOpen(bookmark)}
            className="line-clamp-2 break-words rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)"
          >
            {bookmark.title}
          </a>
        </h3>

        <p className="line-clamp-2 h-[2lh] break-words text-xs leading-relaxed text-(--obsidian-dashboard-shell-text-muted)">{bookmark.description}</p>

        {/* One line: stats that don't fit are cut rather than wrapping onto a second row. */}
        <div className="h-3 overflow-hidden">{bookmark.github && <GithubStatsRow stats={bookmark.github} className="flex-nowrap" />}</div>

        <div className="h-5 overflow-hidden">
          <TagList tags={bookmark.tags} activeTag={activeTag} onTagClick={onTagClick} limit={3} className="flex-nowrap" />
        </div>

        <div className="-mb-1 -mr-1 flex items-center gap-0.5 pt-0.5">
          <time dateTime={bookmark.createdAt} className="mr-auto text-[11px] text-(--obsidian-dashboard-shell-text-subtle)">
            Saved {savedDate.format(new Date(bookmark.createdAt))}
          </time>
          <BookmarkActions bookmark={bookmark} categories={categories} onOpen={onOpen} onTogglePin={onTogglePin} onEdit={onEdit} onMove={onMove} onCopy={onCopy} onDelete={onDelete} />
        </div>
      </div>
    </article>
  );
}

type BookmarkActionsProps = Pick<BookmarkCardProps, "bookmark" | "categories" | "onOpen" | "onTogglePin" | "onEdit" | "onMove" | "onCopy" | "onDelete">;

/** Pin, edit, and the more-actions menu. Pin and edit show on hover or focus of the surrounding `group/item`. */
export function BookmarkActions({ bookmark, categories, onOpen, onTogglePin, onEdit, onMove, onCopy, onDelete }: BookmarkActionsProps) {
  return (
    <>
    <DashboardButton
      variant="ghost"
      size="icon"
      aria-label={bookmark.pinned ? `Unpin ${bookmark.title}` : `Pin ${bookmark.title}`}
      aria-pressed={!!bookmark.pinned}
      onClick={() => onTogglePin(bookmark)}
      className={cn(!bookmark.pinned && "opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 group-focus-within/item:opacity-100")}
    >
      <Pin aria-hidden className={cn(bookmark.pinned && "fill-current")} />
    </DashboardButton>
    <BookmarkFormPopover categories={categories} bookmark={bookmark} onSubmit={(draft) => onEdit(bookmark, draft)}>
      <DashboardButton
        variant="ghost"
        size="icon"
        aria-label={`Edit ${bookmark.title}`}
        className="opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 group-focus-within/item:opacity-100 data-[state=open]:opacity-100"
      >
        <Pencil aria-hidden />
      </DashboardButton>
    </BookmarkFormPopover>
    <DashboardMenu>
      <DashboardMenuTrigger asChild>
        <DashboardButton variant="ghost" size="icon" aria-label={`More actions for ${bookmark.title}`}>
          <Ellipsis aria-hidden />
        </DashboardButton>
      </DashboardMenuTrigger>
      <DashboardMenuContent align="end">
        <DashboardMenuItem asChild>
          <a href={bookmark.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(bookmark)}>
            <ExternalLink aria-hidden />
            Open link
          </a>
        </DashboardMenuItem>
        <DashboardMenuItem onSelect={() => onCopy(bookmark)}>
          <Copy aria-hidden />
          Copy link
        </DashboardMenuItem>
        <DashboardMenuItem onSelect={() => onTogglePin(bookmark)}>
          {bookmark.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          {bookmark.pinned ? "Unpin" : "Pin"}
        </DashboardMenuItem>
        <DashboardMenuSeparator />
        <DashboardMenuLabel>Move to</DashboardMenuLabel>
        <DashboardMenuRadioGroup value={bookmark.categoryId} onValueChange={(categoryId) => onMove(bookmark, categoryId)}>
          {categories.map((option) => (
            <DashboardMenuRadioItem key={option.id} value={option.id}>
              {option.name}
            </DashboardMenuRadioItem>
          ))}
        </DashboardMenuRadioGroup>
        <DashboardMenuSeparator />
        <DashboardMenuItem onSelect={() => onDelete(bookmark)} className="text-(--obsidian-dashboard-shell-danger)">
          <Trash2 aria-hidden />
          Delete
        </DashboardMenuItem>
      </DashboardMenuContent>
    </DashboardMenu>
    </>
  );
}

export function TagList({ tags, activeTag, onTagClick, limit, className }: { tags: string[]; activeTag: string; onTagClick: (tag: string) => void; limit?: number; className?: string }) {
  if (tags.length === 0) return null;
  const shown = limit ? tags.slice(0, limit) : tags;
  const hidden = tags.length - shown.length;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1", className)} aria-label="Tags">
      {shown.map((tag) => (
        <li key={tag} className="flex">
          <button
            type="button"
            onClick={() => onTagClick(tag)}
            aria-pressed={activeTag === tag}
            className={cn(
              // A flex box, not inline, so the pill isn't pushed down onto the text baseline and clipped by the row.
              "flex h-5 cursor-pointer items-center whitespace-nowrap rounded-md px-1.5 text-[11px] leading-none outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)",
              activeTag === tag
                ? "bg-(--obsidian-dashboard-shell-accent) text-(--obsidian-dashboard-shell-accent-foreground)"
                : "bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-text-muted) hover:bg-(--obsidian-dashboard-shell-muted-hover) hover:text-(--obsidian-dashboard-shell-foreground)",
            )}
          >
            #{tag}
          </button>
        </li>
      ))}
      {hidden > 0 && (
        <li className="flex h-5 items-center px-1 text-[11px] leading-none text-(--obsidian-dashboard-shell-text-subtle)" title={tags.slice(shown.length).map((tag) => `#${tag}`).join(" ")}>
          +{hidden}
        </li>
      )}
    </ul>
  );
}

export function CategoryLabel({ category }: { category?: Category }) {
  if (!category) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
      <span className="truncate">{category.name}</span>
    </span>
  );
}

function BookmarkCover({ bookmark, color = "#8b8b8b", priority = false }: { bookmark: Bookmark; color?: string; priority?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = usableImage(bookmark);

  if (image && failedSrc !== image) {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-(--obsidian-dashboard-shell-muted)">
        <img
          // The main process resizes to these widths and caches them; columns are 288 to ~400px wide.
          src={imageSrc(image, 400)}
          srcSet={`${imageSrc(image, 400)} 400w, ${imageSrc(image, 828)} 828w`}
          sizes="(max-width: 640px) 100vw, 400px"
          alt=""
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          draggable={false}
          // The main process remembers images that are really gone, so falling back here is enough.
          onError={() => setFailedSrc(image)}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }

  // Without a preview image, a tinted cover with the site's icon keeps every card the same shape.
  return (
    <div
      className="flex aspect-[16/9] w-full items-center justify-center bg-(--obsidian-dashboard-shell-muted)"
      style={{ backgroundImage: `radial-gradient(circle at 30% 20%, ${color}66, transparent 60%), radial-gradient(circle at 80% 90%, ${color}33, transparent 55%)` }}
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-(--obsidian-dashboard-shell-control) shadow-(--obsidian-dashboard-shell-control-shadow)">
        <Favicon url={bookmark.url} className="size-6" />
      </span>
    </div>
  );
}

export function Favicon({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const domain = hostname(url);

  if (failed) {
    return (
      <span aria-hidden className={cn("flex items-center justify-center rounded-sm bg-(--obsidian-dashboard-shell-muted) text-[9px] font-semibold uppercase", className)}>
        {domain.charAt(0)}
      </span>
    );
  }
  return <img src={faviconUrl(url)} alt="" aria-hidden loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} className={cn("shrink-0 rounded-sm", className)} />;
}
