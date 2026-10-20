"use client";

import { AddCircle, AppDots, Bell, Box, Box2, Brush, Chip, Clipboard, Info, Message2, Slideshow, Target, User } from "@duo-icons/react";
import { ArrowDown, ArrowUp, ChevronsUpDown, CircleCheck, Copy, Download, Ellipsis, ExternalLink, Search, Star, Trash2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type Ref } from "react";
import {
  DashboardButton,
  DashboardConfirmDialog,
  DashboardFilterMenu,
  DashboardMenu,
  DashboardMenuContent,
  DashboardMenuItem,
  DashboardMenuSeparator,
  DashboardMenuTrigger,
  DashboardPopover,
  DashboardPopoverContent,
  DashboardPopoverTrigger,
  DashboardShell,
  type DashboardShellNavItem,
  type DashboardShellNavSection,
  type DashboardShellProps,
} from "@/components/block/dashboard-shell";
import { cn } from "@/lib/utils";

export type LibraryItemStatus = "New" | "Stable" | "Draft";
export type LibraryItemCategory = "Blocks" | "Components" | "Text animations" | "Scroll animations" | "Files & media";
export type LibraryTeam = "design" | "engineering" | "content";

export type LibraryItem = {
  id: string;
  name: string;
  category: LibraryItemCategory;
  status: LibraryItemStatus;
  team: LibraryTeam;
  /** All-time installs. */
  installs: number;
  /** Installs per day for the last seven days, oldest first. */
  trend: number[];
  updatedDaysAgo: number;
  starred?: boolean;
};

export type DashboardShellPageProps = {
  /** Rows of the library table. Defaults to the ObsidianUI catalog. */
  items?: LibraryItem[];
  headingLevel?: 1 | 2 | 3;
  /** Command copied from a row's menu. */
  installCommand?: (item: LibraryItem) => string;
  /** Destination of "Open docs" in a row's menu. Return undefined to hide the item. */
  docsHref?: (item: LibraryItem) => string | undefined;
  linkComponent?: DashboardShellProps["linkComponent"];
  className?: string;
};

export const dashboardShellPageDemoItems: LibraryItem[] = [
  { id: "dashboard-shell", name: "Dashboard Shell", category: "Blocks", status: "New", team: "engineering", installs: 1284, trend: [40, 62, 58, 91, 120, 168, 214], updatedDaysAgo: 1, starred: true },
  { id: "analytics-dashboard", name: "Analytics Dashboard", category: "Blocks", status: "New", team: "engineering", installs: 962, trend: [12, 30, 44, 70, 96, 140, 188], updatedDaysAgo: 0, starred: true },
  { id: "active-sessions", name: "Active Sessions", category: "Components", status: "New", team: "design", installs: 743, trend: [60, 72, 80, 95, 101, 120, 131], updatedDaysAgo: 3 },
  { id: "status-bars", name: "Status Bars", category: "Components", status: "New", team: "engineering", installs: 688, trend: [50, 61, 70, 66, 90, 104, 118], updatedDaysAgo: 4 },
  { id: "discover-button", name: "Discover Button", category: "Components", status: "New", team: "design", installs: 1530, trend: [180, 190, 210, 230, 220, 250, 262], updatedDaysAgo: 6 },
  { id: "split-showcase", name: "Split Showcase", category: "Components", status: "Stable", team: "design", installs: 2210, trend: [300, 310, 295, 320, 330, 318, 340], updatedDaysAgo: 12 },
  { id: "art-gallery", name: "Art Gallery", category: "Components", status: "Stable", team: "content", installs: 3480, trend: [480, 500, 470, 520, 540, 530, 560], updatedDaysAgo: 18, starred: true },
  { id: "hover-img", name: "Hover Image", category: "Files & media", status: "Stable", team: "content", installs: 2875, trend: [420, 400, 410, 430, 415, 440, 452], updatedDaysAgo: 18 },
  { id: "draggable-marquee", name: "Draggable Marquee", category: "Scroll animations", status: "Stable", team: "engineering", installs: 1960, trend: [260, 270, 280, 275, 290, 300, 305], updatedDaysAgo: 18 },
  { id: "text-stream", name: "Text reel", category: "Text animations", status: "Stable", team: "content", installs: 1422, trend: [210, 205, 220, 200, 215, 190, 182], updatedDaysAgo: 18 },
  { id: "flip-text", name: "Flip Text", category: "Text animations", status: "Stable", team: "design", installs: 4105, trend: [560, 580, 600, 590, 610, 620, 640], updatedDaysAgo: 20 },
];

const TEAMS: Record<LibraryTeam, { label: string; owner: string; initials: string; color: string }> = {
  design: { label: "Design", owner: "Maya Chen", initials: "MC", color: "#f9a8d4" },
  engineering: { label: "Engineering", owner: "Alex Morgan", initials: "AM", color: "#fbbf24" },
  content: { label: "Content", owner: "Sam Rivera", initials: "SR", color: "#93c5fd" },
};

const NOTIFICATIONS = [
  { id: "review", title: "Dashboard Shell is ready for review", detail: "The preview build passed." },
  { id: "comment", title: "New comment on Active Sessions", detail: "Design left feedback on the empty state." },
  { id: "docs", title: "Status Bars docs updated", detail: "The props table lists every option." },
];

const TABS = [
  { value: "all", label: "All components" },
  { value: "new", label: "New" },
  { value: "stable", label: "Stable" },
  { value: "starred", label: "Starred" },
];

type SortKey = "newest" | "name" | "installs" | "updated";
type SortState = { key: SortKey; reversed: boolean };

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name" },
  { value: "installs", label: "Most installs" },
  { value: "updated", label: "Recently updated" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All categories" },
  ...(["Blocks", "Components", "Text animations", "Scroll animations", "Files & media"] as const).map((value) => ({ value, label: value })),
];

const STATUS_COLORS: Record<LibraryItemStatus, string> = {
  New: "var(--obsidian-dashboard-shell-accent)",
  Stable: "var(--obsidian-dashboard-shell-success)",
  Draft: "var(--obsidian-dashboard-shell-text-subtle)",
};

/** Sidebar items that narrow the table. Any other item shows an empty view. */
const VIEW_FILTERS: Record<string, (item: LibraryItem) => boolean> = {
  components: () => true,
  blocks: (item) => item.category === "Blocks",
  design: (item) => item.team === "design",
  engineering: (item) => item.team === "engineering",
  content: (item) => item.team === "content",
};

const SECONDARY_NAVIGATION: DashboardShellNavItem[] = [
  { id: "invite", label: "Invite teammates", icon: User },
  { id: "help", label: "Help", icon: Info },
];

const EASE_OUT = [0.25, 1, 0.5, 1] as const;
const WEEKLY_INSTALL_GOAL = 25_000;
const number = new Intl.NumberFormat("en-US");
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const weeklyInstalls = (item: LibraryItem) => item.trend.reduce((sum, value) => sum + value, 0);

function formatUpdated(days: number) {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.round(days / 7)}w ago`;
}

function sortItems(items: LibraryItem[], { key, reversed }: SortState) {
  const sorted =
    key === "name"
      ? items.toSorted((a, b) => a.name.localeCompare(b.name))
      : key === "installs"
        ? items.toSorted((a, b) => b.installs - a.installs)
        : key === "updated"
          ? items.toSorted((a, b) => a.updatedDaysAgo - b.updatedDaysAgo)
          : items;
  return reversed ? sorted.toReversed() : sorted;
}

function downloadCsv(items: LibraryItem[]) {
  const header = ["Component", "Category", "Status", "Owner", "Installs", "Installs this week", "Updated"];
  const rows = items.map((item) => [item.name, item.category, item.status, TEAMS[item.team].owner, String(item.installs), String(weeklyInstalls(item)), formatUpdated(item.updatedDaysAgo)]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "components.csv";
  link.click();
  URL.revokeObjectURL(url);
}

type Toast = { id: number; message: string; undo?: LibraryItem[] };

export function DashboardShellPage({
  items: initialItems = dashboardShellPageDemoItems,
  headingLevel = 1,
  installCommand = (item) => `npx shadcn@latest add https://www.obsidianui.dev/r/${item.id}.json`,
  docsHref = (item) => (item.status === "Draft" ? undefined : `https://www.obsidianui.dev/docs/${item.id}`),
  linkComponent,
  className,
}: DashboardShellPageProps) {
  const [items, setItems] = useState(initialItems);
  const [view, setView] = useState("components");
  const [tab, setTab] = useState("all");
  const [sort, setSort] = useState<SortState>({ key: "newest", reversed: false });
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [unreadIds, setUnreadIds] = useState(["review", "comment"]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ open: boolean; items: LibraryItem[] }>({ open: false, items: [] });
  const draftCount = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string, undo?: LibraryItem[]) => setToast({ id: Date.now(), message, undo });

  const viewFilter = VIEW_FILTERS[view];
  const visibleItems = useMemo(() => {
    if (!viewFilter) return [];
    const search = query.trim().toLowerCase();
    const visible = items
      .filter(viewFilter)
      .filter((item) => tab === "all" || (tab === "starred" ? item.starred : item.status.toLowerCase() === tab))
      .filter((item) => category === "all" || item.category === category)
      .filter((item) => !search || item.name.toLowerCase().includes(search) || item.id.includes(search));
    return sortItems(visible, sort);
  }, [category, items, query, sort, tab, viewFilter]);

  // Selection only acts on rows you can see, so a hidden row is never deleted by surprise.
  const selected = visibleItems.filter((item) => selectedIds.includes(item.id));
  const isFiltered = tab !== "all" || category !== "all" || query.trim() !== "";

  const count = (filter: (item: LibraryItem) => boolean) => items.filter(filter).length;
  const navigation: DashboardShellNavSection[] = [
    {
      id: "library",
      items: [
        { id: "components", label: "Components", icon: AppDots, count: items.length },
        { id: "blocks", label: "Blocks", icon: Box, count: count(VIEW_FILTERS.blocks) },
        { id: "templates", label: "Templates", icon: Slideshow },
        { id: "analytics", label: "Analytics", icon: Target },
        { id: "docs", label: "Docs", icon: Clipboard },
      ],
    },
    {
      id: "teams",
      title: "Teams",
      items: [
        { id: "design", label: "Design", icon: Brush, count: count(VIEW_FILTERS.design) },
        { id: "engineering", label: "Engineering", icon: Chip, count: count(VIEW_FILTERS.engineering) },
        { id: "content", label: "Content", icon: Message2, count: count(VIEW_FILTERS.content) },
      ],
    },
    {
      id: "spaces",
      title: "Spaces",
      items: [
        { id: "landing-pages", label: "Landing pages", color: "#facc15" },
        { id: "dashboards", label: "Dashboards", color: "#f472b6" },
        { id: "marketing", label: "Marketing", color: "#60a5fa" },
      ],
    },
  ];
  const viewLabel = [...navigation.flatMap((section) => section.items), ...SECONDARY_NAVIGATION].find((item) => item.id === view)?.label ?? "Components";

  const resetFilters = () => {
    setTab("all");
    setCategory("all");
    setQuery("");
  };

  const updateItems = (ids: string[], change: (item: LibraryItem) => LibraryItem) =>
    setItems((current) => current.map((item) => (ids.includes(item.id) ? change(item) : item)));

  const toggleSelected = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));

  const toggleAll = () => {
    const visibleIds = visibleItems.map((item) => item.id);
    setSelectedIds((current) =>
      selected.length === visibleItems.length ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])],
    );
  };

  const deleteItems = (ids: string[]) => {
    const previous = items;
    setItems((current) => current.filter((item) => !ids.includes(item.id)));
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    notify(ids.length === 1 ? `${previous.find((item) => item.id === ids[0])?.name ?? "Component"} deleted` : `${ids.length} components deleted`, previous);
  };

  // The dialog keeps its own copy of the rows, so its text stays put while it animates out after the rows are gone.
  const requestDelete = (targets: LibraryItem[]) => setPendingDelete({ open: true, items: targets });

  const setStarred = (ids: string[], starred: boolean) => updateItems(ids, (item) => ({ ...item, starred }));

  const setStatus = (ids: string[], status: LibraryItemStatus) => {
    updateItems(ids, (item) => ({ ...item, status, updatedDaysAgo: 0 }));
    notify(ids.length === 1 ? `Marked as ${status.toLowerCase()}` : `${ids.length} components marked as ${status.toLowerCase()}`);
  };

  const copyInstall = (item: LibraryItem) => {
    const command = installCommand(item);
    if (!navigator.clipboard) return notify("Copying isn't available here");
    navigator.clipboard.writeText(command).then(
      () => notify(`Install command for ${item.name} copied`),
      () => notify("Couldn't copy the install command"),
    );
  };

  const addItem = () => {
    draftCount.current += 1;
    const draft: LibraryItem = {
      id: `untitled-${draftCount.current}`,
      name: draftCount.current === 1 ? "Untitled component" : `Untitled component ${draftCount.current}`,
      category: "Components",
      status: "Draft",
      team: "design",
      installs: 0,
      trend: [0, 0, 0, 0, 0, 0, 0],
      updatedDaysAgo: 0,
    };
    setItems((current) => [draft, ...current]);
    setView("components");
    setSort({ key: "newest", reversed: false });
    resetFilters();
    notify(`${draft.name} added`);
  };

  const onSort = (key: SortKey) => setSort((current) => (current.key === key ? { key, reversed: !current.reversed } : { key, reversed: false }));

  const allSelectedStarred = selected.length > 0 && selected.every((item) => item.starred);
  const weeklyTotal = visibleItems.reduce((sum, item) => sum + weeklyInstalls(item), 0);
  const libraryWeekly = items.reduce((sum, item) => sum + weeklyInstalls(item), 0);

  return (
    <div className={cn("h-full w-full", className)}>
      <DashboardShell
        brand={{
          name: "ObsidianUI",
          description: "Component library",
          logo: (
            <span className="flex size-8 items-center justify-center rounded-md bg-(--obsidian-dashboard-shell-foreground) text-(--obsidian-dashboard-shell-background)">
              <Box2 size={16} aria-hidden />
            </span>
          ),
        }}
        navigation={navigation}
        secondaryNavigation={SECONDARY_NAVIGATION}
        sidebarFooter={<UsageCard used={libraryWeekly} goal={WEEKLY_INSTALL_GOAL} />}
        activeItemId={view}
        onActiveItemChange={(id) => {
          setView(id);
          setSelectedIds([]);
        }}
        linkComponent={linkComponent}
        title={viewLabel}
        headingLevel={headingLevel}
        status="Active"
        headerActions={
          <>
            <SearchButton query={query} onQueryChange={setQuery} />
            <NotificationsButton unreadIds={unreadIds} onUnreadIdsChange={setUnreadIds} />
            <ProfileButton />
          </>
        }
        tabs={TABS}
        tab={tab}
        onTabChange={setTab}
        filters={
          <>
            <DashboardFilterMenu
              label="Sort by"
              value={sort.key}
              options={SORT_OPTIONS}
              onValueChange={(value) => setSort({ key: value as SortKey, reversed: false })}
            />
            <DashboardFilterMenu label="Category" value={category} options={CATEGORY_OPTIONS} onValueChange={setCategory} />
          </>
        }
        toolbarActions={
          <>
            <DashboardButton variant="secondary" size="sm" onClick={() => downloadCsv(selected.length ? selected : visibleItems)}>
              <Download aria-hidden />
              Export
            </DashboardButton>
            <DashboardButton variant="primary" size="sm" onClick={addItem}>
              <AddCircle aria-hidden />
              New component
            </DashboardButton>
          </>
        }
      >
        <div className="@container/table flex min-h-full flex-col">
          {!viewFilter ? (
            <EmptyState
              title={`Nothing in ${viewLabel} yet`}
              detail="Components you add to this space will show up here."
              action="Show all components"
              onAction={() => setView("components")}
            />
          ) : visibleItems.length === 0 ? (
            <EmptyState
              title="No components match"
              detail={isFiltered ? "Try another tab, category, or search." : `There are no components in ${viewLabel}.`}
              action={isFiltered ? "Clear filters" : "Show all components"}
              onAction={isFiltered ? resetFilters : () => setView("components")}
            />
          ) : (
            <LibraryTable
              items={visibleItems}
              selectedIds={selectedIds}
              sort={sort}
              onSort={onSort}
              onToggle={toggleSelected}
              onToggleAll={toggleAll}
              onStar={(item) => setStarred([item.id], !item.starred)}
              onStatus={(item) => setStatus([item.id], item.status === "Stable" ? "New" : "Stable")}
              onCopy={copyInstall}
              onDelete={(item) => requestDelete([item])}
              docsHref={docsHref}
            />
          )}

          {/* The 1px gaps show the border color through, drawing the dividers at any column count. */}
          <dl className="mt-auto grid grid-cols-2 gap-px border-y border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-border) text-xs leading-none @xl/table:grid-cols-4">
            <Stat value={number.format(visibleItems.length)} label={visibleItems.length === 1 ? "Component in view" : "Components in view"} />
            <Stat value={number.format(visibleItems.filter((item) => item.status === "New").length)} label="New" />
            <Stat value={compactNumber.format(weeklyTotal)} label="Installs this week" />
            <Stat value={number.format(visibleItems.filter((item) => item.starred).length)} label="Starred" />
          </dl>

          <div className="pointer-events-none sticky bottom-3 z-10 flex flex-col items-center gap-2 px-3 pt-3">
            <AnimatePresence>
              {selected.length > 0 && (
                <FloatingBar key="selection">
                  <span className="px-2 text-xs tabular-nums">
                    <RollingCount value={selected.length} /> selected
                  </span>
                  <BarDivider />
                  <DashboardButton variant="ghost" size="sm" onClick={() => setStarred(selected.map((item) => item.id), !allSelectedStarred)}>
                    <Star aria-hidden className={cn(allSelectedStarred && "fill-current")} />
                    {allSelectedStarred ? "Unstar" : "Star"}
                  </DashboardButton>
                  <DashboardButton variant="ghost" size="sm" onClick={() => setStatus(selected.map((item) => item.id), "Stable")}>
                    <CircleCheck aria-hidden />
                    <span className="hidden @md/table:inline">Mark</span> stable
                  </DashboardButton>
                  <DashboardButton variant="ghost" size="sm" className="hidden @md/table:inline-flex" onClick={() => downloadCsv(selected)}>
                    <Download aria-hidden />
                    Export
                  </DashboardButton>
                  <DashboardButton
                    variant="ghost"
                    size="sm"
                    className="text-(--obsidian-dashboard-shell-danger) hover:text-(--obsidian-dashboard-shell-danger)"
                    onClick={() => requestDelete(selected)}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </DashboardButton>
                  <BarDivider />
                  <DashboardButton variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSelectedIds([])}>
                    <X aria-hidden />
                  </DashboardButton>
                </FloatingBar>
              )}
            </AnimatePresence>
            <div role="status" className="flex justify-center">
              <AnimatePresence mode="popLayout">
                {toast && (
                  <FloatingBar key={toast.id}>
                    <span className="px-2 text-xs">{toast.message}</span>
                    {toast.undo && (
                      <DashboardButton
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setItems(toast.undo!);
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
        </div>

        <DashboardConfirmDialog
          open={pendingDelete.open}
          onOpenChange={(open) => setPendingDelete((current) => ({ ...current, open }))}
          tone="danger"
          title={pendingDelete.items.length === 1 ? `Delete ${pendingDelete.items[0].name}?` : `Delete ${pendingDelete.items.length} components?`}
          description={`${pendingDelete.items.length === 1 ? "It's" : "They're"} removed from the library and from your teammates' views. You can undo right after.`}
          confirmLabel="Delete"
          onConfirm={() => deleteItems(pendingDelete.items.map((item) => item.id))}
        />
      </DashboardShell>
    </div>
  );
}

type LibraryTableProps = {
  items: LibraryItem[];
  selectedIds: string[];
  sort: SortState;
  onSort: (key: SortKey) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onStar: (item: LibraryItem) => void;
  onStatus: (item: LibraryItem) => void;
  onCopy: (item: LibraryItem) => void;
  onDelete: (item: LibraryItem) => void;
  docsHref: (item: LibraryItem) => string | undefined;
};

const cell = "px-3 py-2.5 align-middle @lg/table:px-4";
const hideBelow = { md: "hidden @md/table:table-cell", lg: "hidden @lg/table:table-cell", xl: "hidden @xl/table:table-cell", "2xl": "hidden @2xl/table:table-cell" };

function LibraryTable({ items, selectedIds, sort, onSort, onToggle, onToggleAll, onStar, onStatus, onCopy, onDelete, docsHref }: LibraryTableProps) {
  const reduceMotion = useReducedMotion();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedCount = items.filter((item) => selectedIds.includes(item.id)).length;
  const allSelected = selectedCount === items.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [allSelected, selectedCount]);

  // Clicking anywhere on a row selects it, except on the row's own controls.
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((event.target as HTMLElement).closest("button, a, input, [role='menuitem']")) return;
    onToggle(id);
  };

  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-y border-(--obsidian-dashboard-shell-border) text-xs text-(--obsidian-dashboard-shell-text-subtle)">
          <th scope="col" className="w-10 py-2.5 pl-3 pr-0 @lg/table:pl-4">
            <Checkbox ref={selectAllRef} checked={allSelected} onChange={onToggleAll} label="Select all components in view" />
          </th>
          <SortHeader label="Component" sortKey="name" sort={sort} onSort={onSort} />
          <th scope="col" className={cn(cell, hideBelow.md, "font-normal")}>Category</th>
          <SortHeader label="Installs" sortKey="installs" sort={sort} onSort={onSort} className={hideBelow.lg} />
          <SortHeader label="Updated" sortKey="updated" sort={sort} onSort={onSort} className={hideBelow.xl} />
          <th scope="col" className={cn(cell, hideBelow["2xl"], "font-normal")}>Owner</th>
          <th scope="col" className={cn(cell, "font-normal")}>Status</th>
          <th scope="col" className="w-10 py-2.5 pl-0 pr-3 @lg/table:pr-4">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const team = TEAMS[item.team];
            const docs = docsHref(item);
            return (
              <motion.tr
                key={item.id}
                layout={reduceMotion ? false : "position"}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)" }}
                exit={
                  reduceMotion
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, x: 28, filter: "blur(3px)", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }
                }
                transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT, layout: { type: "spring", stiffness: 500, damping: 40 } }}
                data-selected={isSelected}
                onClick={(event) => onRowClick(event, item.id)}
                className="group/row cursor-pointer border-b border-(--obsidian-dashboard-shell-border) transition-colors duration-200 last:border-b-0 hover:bg-(--obsidian-dashboard-shell-hover) data-[selected=true]:bg-[color-mix(in_oklab,var(--obsidian-dashboard-shell-accent)_9%,transparent)] motion-reduce:transition-none"
              >
                {/* The accent edge grows in from the middle as the row is selected. */}
                <td className="relative w-10 py-2.5 pl-3 pr-0 align-middle before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:scale-y-0 before:rounded-full before:bg-(--obsidian-dashboard-shell-accent) before:transition-[scale] before:duration-200 before:ease-[cubic-bezier(0.25,1,0.5,1)] group-data-[selected=true]/row:before:scale-y-100 motion-reduce:before:transition-none @lg/table:pl-4">
                  <Checkbox checked={isSelected} onChange={() => onToggle(item.id)} label={`Select ${item.name}`} />
                </td>
                <td className={cell}>
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={!!item.starred}
                      aria-label={item.starred ? `Unstar ${item.name}` : `Star ${item.name}`}
                      onClick={() => onStar(item)}
                      className={cn(
                        "-ml-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md outline-none transition-[color,scale,background-color] duration-150 hover:bg-(--obsidian-dashboard-shell-muted) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) active:scale-90",
                        item.starred ? "text-[#f59e0b]" : "text-(--obsidian-dashboard-shell-text-subtle) hover:text-(--obsidian-dashboard-shell-foreground)",
                      )}
                    >
                      <Star aria-hidden className={cn("size-3.5", item.starred && "fill-current")} />
                    </button>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium leading-none">{item.name}</span>
                      <span className="truncate font-mono text-[11px] leading-none text-(--obsidian-dashboard-shell-text-subtle)">@obsidianui/{item.id}</span>
                    </div>
                  </div>
                </td>
                <td className={cn(cell, hideBelow.md, "whitespace-nowrap text-(--obsidian-dashboard-shell-text-muted)")}>{item.category}</td>
                <td className={cn(cell, hideBelow.lg, "whitespace-nowrap")}>
                  <span className="flex items-center gap-2.5">
                    <Sparkline values={item.trend} />
                    <span className="tabular-nums text-xs">{number.format(item.installs)}</span>
                  </span>
                </td>
                <td className={cn(cell, hideBelow.xl, "whitespace-nowrap text-xs text-(--obsidian-dashboard-shell-text-muted)")}>{formatUpdated(item.updatedDaysAgo)}</td>
                <td className={cn(cell, hideBelow["2xl"], "whitespace-nowrap")}>
                  <span className="flex items-center gap-2 text-xs text-(--obsidian-dashboard-shell-text-muted)">
                    <span aria-hidden className="grid size-5 place-items-center rounded-full text-[9px] font-semibold text-[#1f1300]" style={{ backgroundColor: team.color }}>
                      {team.initials}
                    </span>
                    {team.owner}
                  </span>
                </td>
                <td className={cn(cell, "whitespace-nowrap")}>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.status] }} />
                    {item.status}
                  </span>
                </td>
                <td className="w-10 py-2.5 pl-0 pr-3 text-right align-middle @lg/table:pr-4">
                  <DashboardMenu>
                    <DashboardMenuTrigger asChild>
                      <DashboardButton variant="ghost" size="icon" aria-label={`Actions for ${item.name}`} className="size-7">
                        <Ellipsis aria-hidden />
                      </DashboardButton>
                    </DashboardMenuTrigger>
                    <DashboardMenuContent align="end" className="min-w-48">
                      <DashboardMenuItem onSelect={() => onCopy(item)}>
                        <Copy aria-hidden />
                        Copy install command
                      </DashboardMenuItem>
                      {docs && (
                        <DashboardMenuItem asChild>
                          <a href={docs} target="_blank" rel="noreferrer">
                            <ExternalLink aria-hidden />
                            Open docs
                          </a>
                        </DashboardMenuItem>
                      )}
                      <DashboardMenuItem onSelect={() => onStar(item)}>
                        <Star aria-hidden />
                        {item.starred ? "Unstar" : "Star"}
                      </DashboardMenuItem>
                      <DashboardMenuItem onSelect={() => onStatus(item)}>
                        <CircleCheck aria-hidden />
                        {item.status === "Stable" ? "Mark as new" : "Mark as stable"}
                      </DashboardMenuItem>
                      <DashboardMenuSeparator />
                      <DashboardMenuItem
                        onSelect={() => onDelete(item)}
                        className="text-(--obsidian-dashboard-shell-danger) data-[highlighted]:text-(--obsidian-dashboard-shell-danger)"
                      >
                        <Trash2 aria-hidden />
                        Delete
                      </DashboardMenuItem>
                    </DashboardMenuContent>
                  </DashboardMenu>
                </td>
              </motion.tr>
            );
          })}
        </AnimatePresence>
      </tbody>
    </table>
  );
}

function SortHeader({ label, sortKey, sort, onSort, className }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void; className?: string }) {
  const isActive = sort.key === sortKey;
  // Names read A to Z first; installs and dates show the biggest and newest first.
  const naturallyAscending = sortKey === "name";
  const ascending = naturallyAscending !== sort.reversed;
  const Icon = !isActive ? ChevronsUpDown : ascending ? ArrowUp : ArrowDown;

  return (
    <th scope="col" aria-sort={isActive ? (ascending ? "ascending" : "descending") : undefined} className={cn(cell, "font-normal", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "-mx-1.5 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 outline-none transition-colors duration-150 hover:bg-(--obsidian-dashboard-shell-muted) hover:text-(--obsidian-dashboard-shell-foreground) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)",
          isActive && "text-(--obsidian-dashboard-shell-foreground)",
        )}
      >
        {label}
        <Icon aria-hidden className={cn("size-3", !isActive && "opacity-60")} />
      </button>
    </th>
  );
}

// A native input underneath keeps keyboard, form, and screen reader behavior; the marks on top only draw the state.
function Checkbox({ checked, onChange, label, ref }: { checked: boolean; onChange: () => void; label: string; ref?: Ref<HTMLInputElement> }) {
  return (
    <span className="relative grid size-4 place-items-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="peer col-start-1 row-start-1 size-4 cursor-pointer appearance-none rounded-[5px] bg-(--obsidian-dashboard-shell-control) shadow-[0_0_0_1px_var(--obsidian-dashboard-shell-border-strong),0_1px_2px_rgb(0_0_0/0.06)] outline-none transition-[background-color,box-shadow,scale] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] [&:not(:checked,:indeterminate):hover]:shadow-[0_0_0_1px_var(--obsidian-dashboard-shell-ring),0_1px_2px_rgb(0_0_0/0.06)] focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) focus-visible:ring-offset-1 focus-visible:ring-offset-(--obsidian-dashboard-shell-background) active:scale-[0.85] active:duration-75 checked:bg-(--obsidian-dashboard-shell-accent) checked:shadow-[0_0_0_1px_var(--obsidian-dashboard-shell-accent),inset_0_1px_0_rgb(255_255_255/0.2)] indeterminate:bg-(--obsidian-dashboard-shell-accent) indeterminate:shadow-[0_0_0_1px_var(--obsidian-dashboard-shell-accent),inset_0_1px_0_rgb(255_255_255/0.2)] motion-reduce:transition-none"
      />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none col-start-1 row-start-1 size-4 scale-75 text-(--obsidian-dashboard-shell-accent-foreground) opacity-0 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none [&>path]:[stroke-dasharray:1] [&>path]:[stroke-dashoffset:1] [&>path]:transition-[stroke-dashoffset] [&>path]:duration-200 [&>path]:delay-75 [&>path]:ease-out peer-checked:[&>path]:[stroke-dashoffset:0] motion-reduce:[&>path]:transition-none"
      >
        <path d="M4.5 8.25 7 10.5l4.5-5" pathLength={1} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none col-start-1 row-start-1 h-[1.75px] w-2 scale-x-0 rounded-full bg-(--obsidian-dashboard-shell-accent-foreground) transition-[scale] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] peer-indeterminate:scale-x-100 motion-reduce:transition-none"
      />
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 56;
  const height = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${((index / Math.max(values.length - 1, 1)) * width).toFixed(1)},${(height - 1 - ((value - min) / span) * (height - 2)).toFixed(1)}`).join(" ");
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const color = max === 0 ? "var(--obsidian-dashboard-shell-text-subtle)" : last >= first ? "var(--obsidian-dashboard-shell-success)" : "var(--obsidian-dashboard-shell-danger)";

  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-row-reverse items-center justify-end gap-2 bg-(--obsidian-dashboard-shell-background) p-3">
      <dt className="text-(--obsidian-dashboard-shell-text-subtle)">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action: string; onAction: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-(--obsidian-dashboard-shell-border) px-6 py-16 text-center">
      <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-icon) shadow-(--obsidian-dashboard-shell-control-shadow)">
        <AppDots size={20} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-(--obsidian-dashboard-shell-text-subtle)">{detail}</p>
      </div>
      <DashboardButton variant="secondary" size="sm" onClick={onAction}>
        {action}
      </DashboardButton>
    </div>
  );
}

function FloatingBar({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98, filter: "blur(2px)" }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
      className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-(--obsidian-dashboard-shell-menu) p-1 text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-menu-shadow) backdrop-blur-xl backdrop-saturate-150"
    >
      {children}
    </motion.div>
  );
}

function RollingCount({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  // Counting up rolls the number upward, counting down rolls it back.
  const [shown, setShown] = useState({ value, direction: 1 });
  if (shown.value !== value) setShown({ value, direction: value > shown.value ? 1 : -1 });
  const { direction } = shown;

  if (reduceMotion) return <span className="font-medium">{value}</span>;
  return (
    <span className="relative inline-flex overflow-hidden align-bottom font-medium">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span
          key={value}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ y: dir > 0 ? "80%" : "-80%", opacity: 0 }),
            center: { y: 0, opacity: 1 },
            leave: (dir: number) => ({ y: dir > 0 ? "-80%" : "80%", opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="leave"
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function BarDivider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-(--obsidian-dashboard-shell-border-strong)" />;
}

function UsageCard({ used, goal }: { used: number; goal: number }) {
  const percent = Math.min(100, Math.round((used / goal) * 100));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-xs leading-none">
        <span className="font-medium">Weekly installs</span>
        <span className="tabular-nums text-(--obsidian-dashboard-shell-text-subtle)">
          {compactNumber.format(used)} / {compactNumber.format(goal)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Weekly installs toward goal"
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-valuenow={used}
        className="h-1.5 overflow-hidden rounded-full bg-(--obsidian-dashboard-shell-muted)"
      >
        <div className="h-full rounded-full bg-(--obsidian-dashboard-shell-accent) transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-[11px] leading-none text-(--obsidian-dashboard-shell-text-subtle)">{percent}% of this week&apos;s goal</span>
    </div>
  );
}

function SearchButton({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  return (
    <DashboardPopover>
      <DashboardPopoverTrigger asChild>
        <DashboardButton variant="secondary" size="icon" aria-label="Search components" className="relative">
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
            placeholder="Search components"
            aria-label="Search components"
            className="h-8 w-full rounded-md bg-(--obsidian-dashboard-shell-control) pl-8 pr-2.5 text-xs text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-control-shadow) outline-none placeholder:text-(--obsidian-dashboard-shell-text-subtle) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring)"
          />
        </div>
      </DashboardPopoverContent>
    </DashboardPopover>
  );
}

function NotificationsButton({ unreadIds, onUnreadIdsChange }: { unreadIds: string[]; onUnreadIdsChange: (ids: string[]) => void }) {
  const unreadCount = unreadIds.length;

  return (
    <DashboardPopover>
      <DashboardPopoverTrigger asChild>
        <DashboardButton variant="secondary" size="icon" aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"} className="relative">
          <Bell aria-hidden />
          {unreadCount > 0 && (
            <span aria-hidden className="absolute right-[6px] top-[6px] size-1.5 rounded-full bg-(--obsidian-dashboard-shell-danger) ring-2 ring-(--obsidian-dashboard-shell-control)" />
          )}
        </DashboardButton>
      </DashboardPopoverTrigger>
      <DashboardPopoverContent align="end" className="w-[min(320px,calc(100vw-2rem))]">
        <div className="flex items-center justify-between gap-2 py-1 pl-2.5 pr-1">
          <span className="text-[11px] font-medium uppercase leading-none tracking-[1px] text-(--obsidian-dashboard-shell-text-subtle)">Notifications</span>
          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={() => onUnreadIdsChange([])}
            className="h-7 cursor-pointer rounded-md px-2 text-xs text-(--obsidian-dashboard-shell-text-muted) outline-none transition-[background-color,color] duration-150 hover:bg-(--obsidian-dashboard-shell-menu-highlight) hover:text-(--obsidian-dashboard-shell-foreground) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) disabled:pointer-events-none disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
        <div aria-hidden className="-mx-1 my-1 h-px bg-(--obsidian-dashboard-shell-border)" />
        <ul className="flex flex-col">
          {NOTIFICATIONS.map((notification) => {
            const isUnread = unreadIds.includes(notification.id);
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  onClick={() => onUnreadIdsChange(unreadIds.filter((id) => id !== notification.id))}
                  className="flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 text-left outline-none transition-[background-color,scale] duration-150 hover:bg-(--obsidian-dashboard-shell-menu-highlight) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) active:scale-[0.98] active:duration-75"
                >
                  <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full transition-colors duration-200", isUnread ? "bg-(--obsidian-dashboard-shell-accent)" : "bg-transparent")} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className={cn("text-xs font-medium leading-snug", !isUnread && "text-(--obsidian-dashboard-shell-text-muted)")}>
                      {notification.title}
                      {isUnread && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="text-[11px] leading-snug text-(--obsidian-dashboard-shell-text-subtle)">{notification.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </DashboardPopoverContent>
    </DashboardPopover>
  );
}

function ProfileButton() {
  return (
    <DashboardMenu>
      <DashboardMenuTrigger asChild>
        <DashboardButton variant="secondary" size="sm" aria-label="Open account menu for Alex Morgan" className="gap-1.5 pl-[5px] pr-[7px] font-normal">
          <span aria-hidden className="flex size-5 items-center justify-center rounded-[5px] bg-[#f59e0b] text-[10px] font-semibold text-[#1f1300]">
            AM
          </span>
          <span className="hidden @xl/dashboard-shell:inline">Alex Morgan</span>
        </DashboardButton>
      </DashboardMenuTrigger>
      <DashboardMenuContent align="end">
        <DashboardMenuItem>Profile</DashboardMenuItem>
        <DashboardMenuItem>Settings</DashboardMenuItem>
        <DashboardMenuSeparator />
        <DashboardMenuItem>Sign out</DashboardMenuItem>
      </DashboardMenuContent>
    </DashboardMenu>
  );
}

export default DashboardShellPage;
