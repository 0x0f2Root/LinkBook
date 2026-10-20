
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, Menu, X } from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import { createContext, createElement, memo, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps, CSSProperties, ElementType, FocusEvent, KeyboardEvent, PointerEvent, ReactNode, Ref, RefObject } from "react";
import { cn } from "@/lib/utils";
import "./dashboard-shell.css";

const EASE_OUT = [0.25, 1, 0.5, 1] as const;
/** The hover highlight glides after the pointer. */
const FOLLOW_SPRING = { type: "spring", stiffness: 650, damping: 45, mass: 0.5 } as const;
/** The active pill slides to the chosen item. */
const PILL_SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const;
/** Menus and popovers settle from a slight squash with a small overshoot. */
const LAYER_SPRING = { type: "spring", stiffness: 560, damping: 26, mass: 0.7 } as const;
const RESIZE_STEP = 10;
/** The sidebar docks beside the content from this container width, in rem. Keep in sync with `@2xl/dashboard-shell`. */
const DOCKED_SIDEBAR_REM = 42;

export const dashboardButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium leading-none outline-none select-none transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-(--obsidian-dashboard-shell-accent) text-(--obsidian-dashboard-shell-accent-foreground) shadow-(--obsidian-dashboard-shell-accent-shadow) hover:bg-(--obsidian-dashboard-shell-accent-hover)",
        secondary:
          "bg-(--obsidian-dashboard-shell-control) text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-control-shadow) hover:bg-(--obsidian-dashboard-shell-muted) data-[state=open]:bg-(--obsidian-dashboard-shell-muted)",
        muted:
          "bg-(--obsidian-dashboard-shell-muted) text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-control-shadow) hover:bg-(--obsidian-dashboard-shell-muted-hover)",
        ghost:
          "text-(--obsidian-dashboard-shell-text-subtle) hover:bg-(--obsidian-dashboard-shell-muted) hover:text-(--obsidian-dashboard-shell-foreground)",
        danger:
          "bg-(--obsidian-dashboard-shell-danger-solid) text-white shadow-[0_1px_2px_rgb(0_0_0/0.16),inset_0_1px_0_rgb(255_255_255/0.16),0_0_0_1px_rgb(0_0_0/0.08)] hover:bg-(--obsidian-dashboard-shell-danger-solid-hover)",
      },
      size: {
        sm: "h-[30px] px-[9px] text-xs [&_svg]:size-3",
        md: "h-8 px-2.5 text-sm [&_svg]:size-4",
        icon: "size-[30px] [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "secondary", size: "sm" },
  },
);

export type DashboardButtonProps = ComponentProps<"button"> & VariantProps<typeof dashboardButtonVariants>;

export function DashboardButton({ variant, size, className, type = "button", ...props }: DashboardButtonProps) {
  return <button type={type} className={cn(dashboardButtonVariants({ variant, size }), className)} {...props} />;
}

// Menus and popovers portal to the body, outside the shell, so they carry the layer class that holds the palette.
const layerClassName =
  "obsidian-dashboard-shell-layer z-50 rounded-[10px] bg-(--obsidian-dashboard-shell-menu) p-1 text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-menu-shadow) outline-none backdrop-blur-xl backdrop-saturate-150";

function layerMotion(reduceMotion: boolean) {
  if (reduceMotion) {
    return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } };
  }
  return {
    initial: { opacity: 0, scaleX: 0.92, scaleY: 0.86, filter: "blur(8px)" },
    animate: {
      opacity: 1,
      scaleX: 1,
      scaleY: 1,
      filter: "blur(0px)",
      transition: { ...LAYER_SPRING, opacity: { duration: 0.16, ease: EASE_OUT }, filter: { duration: 0.24, ease: EASE_OUT } },
    },
    exit: { opacity: 0, scaleX: 0.96, scaleY: 0.94, filter: "blur(4px)", transition: { duration: 0.14, ease: EASE_OUT } },
  };
}

// Exit animations need the open state, since the content stays mounted until it has animated out.
const LayerOpenContext = createContext(false);

// Portaled layers leave a scoped `.dark` wrapper behind, so the shell passes its theme down to them.
const ShellDarkContext = createContext(false);

function useScopedDark(ref: RefObject<HTMLElement | null>, className?: string) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setIsDark(element.closest(".dark") !== null);
    update();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(update);
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      observer.observe(node, { attributes: true, attributeFilter: ["class"] });
    }
    return () => observer.disconnect();
  }, [ref, className]);

  return isDark;
}

export type DashboardMenuProps = ComponentProps<typeof DropdownMenuPrimitive.Root>;

export function DashboardMenu({ open, defaultOpen = false, onOpenChange, ...props }: DashboardMenuProps) {
  const [isOpen, setIsOpen] = useControllableState(open, defaultOpen, onOpenChange);
  return (
    <LayerOpenContext.Provider value={isOpen}>
      <DropdownMenuPrimitive.Root open={isOpen} onOpenChange={setIsOpen} {...props} />
    </LayerOpenContext.Provider>
  );
}

export const DashboardMenuTrigger = DropdownMenuPrimitive.Trigger;

export type DashboardMenuContentProps = Omit<ComponentProps<typeof DropdownMenuPrimitive.Content>, "asChild" | "forceMount">;

export function DashboardMenuContent({ className, children, sideOffset = 6, ...props }: DashboardMenuContentProps) {
  const isOpen = useContext(LayerOpenContext);
  const isDark = useContext(ShellDarkContext);
  const reduceMotion = !!useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <DropdownMenuPrimitive.Portal forceMount>
          <DropdownMenuPrimitive.Content forceMount asChild sideOffset={sideOffset} {...props}>
            <motion.div
              {...layerMotion(reduceMotion)}
              className={cn(
                layerClassName,
                isDark && "dark",
                "obsidian-dashboard-shell-scroll max-h-(--radix-dropdown-menu-content-available-height) min-w-40 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overscroll-contain",
                className,
              )}
            >
              <HoverHighlightList highlightClassName="rounded-md bg-(--obsidian-dashboard-shell-menu-highlight)">{children}</HoverHighlightList>
            </motion.div>
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

const menuItemClassName =
  "relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 text-xs leading-none text-(--obsidian-dashboard-shell-text-muted) outline-none transition-[color,scale] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-[0.97] active:duration-75 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:text-(--obsidian-dashboard-shell-foreground) [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

// Radix focuses items on hover and with the arrow keys, so following focus moves the highlight for both.
function useHighlightOnFocus(onFocus?: (event: FocusEvent<HTMLDivElement>) => void, onBlur?: (event: FocusEvent<HTMLDivElement>) => void) {
  const highlight = useContext(HoverHighlightContext);
  return {
    onFocus: (event: FocusEvent<HTMLDivElement>) => {
      onFocus?.(event);
      highlight?.show(event.currentTarget);
    },
    onBlur: (event: FocusEvent<HTMLDivElement>) => {
      onBlur?.(event);
      highlight?.hide();
    },
  };
}

export function DashboardMenuItem({ className, onFocus, onBlur, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  const focusHandlers = useHighlightOnFocus(onFocus, onBlur);
  return <DropdownMenuPrimitive.Item className={cn(menuItemClassName, className)} {...focusHandlers} {...props} />;
}

export const DashboardMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export function DashboardMenuRadioItem({ className, children, onFocus, onBlur, ...props }: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  const focusHandlers = useHighlightOnFocus(onFocus, onBlur);
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(menuItemClassName, "pr-8 data-[state=checked]:font-medium data-[state=checked]:text-(--obsidian-dashboard-shell-foreground)", className)}
      {...focusHandlers}
      {...props}
    >
      {children}
      <DropdownMenuPrimitive.ItemIndicator className="absolute right-2.5 flex">
        <Check aria-hidden className="size-3.5!" />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
}

export function DashboardMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("px-2.5 pb-2 pt-2.5 text-[11px] font-medium uppercase leading-none tracking-[1px] text-(--obsidian-dashboard-shell-text-subtle)", className)}
      {...props}
    />
  );
}

export function DashboardMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-(--obsidian-dashboard-shell-border)", className)} {...props} />;
}

export type DashboardPopoverProps = ComponentProps<typeof PopoverPrimitive.Root>;

export function DashboardPopover({ open, defaultOpen = false, onOpenChange, ...props }: DashboardPopoverProps) {
  const [isOpen, setIsOpen] = useControllableState(open, defaultOpen, onOpenChange);
  return (
    <LayerOpenContext.Provider value={isOpen}>
      <PopoverPrimitive.Root open={isOpen} onOpenChange={setIsOpen} {...props} />
    </LayerOpenContext.Provider>
  );
}

export const DashboardPopoverTrigger = PopoverPrimitive.Trigger;

export type DashboardPopoverContentProps = Omit<ComponentProps<typeof PopoverPrimitive.Content>, "asChild" | "forceMount">;

export function DashboardPopoverContent({ className, children, align = "center", sideOffset = 6, ...props }: DashboardPopoverContentProps) {
  const isOpen = useContext(LayerOpenContext);
  const isDark = useContext(ShellDarkContext);
  const reduceMotion = !!useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <PopoverPrimitive.Portal forceMount>
          <PopoverPrimitive.Content forceMount asChild align={align} sideOffset={sideOffset} {...props}>
            <motion.div
              {...layerMotion(reduceMotion)}
              className={cn(layerClassName, isDark && "dark", "w-72 origin-(--radix-popover-content-transform-origin)", className)}
            >
              {children}
            </motion.div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

export type DashboardConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** "danger" paints the confirm button red, for deleting and other actions that remove things. */
  tone?: "default" | "danger";
  onConfirm: () => void;
};

export function DashboardConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
}: DashboardConfirmDialogProps) {
  const isDark = useContext(ShellDarkContext);
  const reduceMotion = !!useReducedMotion();

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <AlertDialogPrimitive.Portal forceMount>
            <AlertDialogPrimitive.Overlay forceMount asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: EASE_OUT }}
                className={cn("fixed inset-0 z-50 backdrop-blur-[2px]", isDark ? "bg-black/50" : "bg-black/25")}
              />
            </AlertDialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <AlertDialogPrimitive.Content forceMount asChild>
                <motion.div
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: 6, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)", transition: reduceMotion ? { duration: 0 } : { ...LAYER_SPRING, opacity: { duration: 0.16, ease: EASE_OUT }, filter: { duration: 0.2, ease: EASE_OUT } } }}
                  exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.97, y: 4, filter: "blur(4px)", transition: { duration: 0.14, ease: EASE_OUT } }}
                  className={cn(
                    "obsidian-dashboard-shell-layer pointer-events-auto flex w-full max-w-sm flex-col gap-4 rounded-xl bg-(--obsidian-dashboard-shell-background) p-4 text-(--obsidian-dashboard-shell-foreground) shadow-(--obsidian-dashboard-shell-menu-shadow) outline-none",
                    isDark && "dark",
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    <AlertDialogPrimitive.Title className="text-sm font-medium leading-snug">{title}</AlertDialogPrimitive.Title>
                    {description ? (
                      <AlertDialogPrimitive.Description className="text-xs leading-relaxed text-(--obsidian-dashboard-shell-text-muted)">{description}</AlertDialogPrimitive.Description>
                    ) : (
                      <AlertDialogPrimitive.Description className="sr-only">{title}</AlertDialogPrimitive.Description>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <AlertDialogPrimitive.Cancel asChild>
                      <DashboardButton variant="secondary" size="sm">
                        {cancelLabel}
                      </DashboardButton>
                    </AlertDialogPrimitive.Cancel>
                    <AlertDialogPrimitive.Action asChild>
                      <DashboardButton variant={tone === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm}>
                        {confirmLabel}
                      </DashboardButton>
                    </AlertDialogPrimitive.Action>
                  </div>
                </motion.div>
              </AlertDialogPrimitive.Content>
            </div>
          </AlertDialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </AlertDialogPrimitive.Root>
  );
}

export type DashboardFilterOption = { value: string; label: string };

export type DashboardFilterMenuProps = {
  /** Shown before the current value and as the menu heading, such as "Sort by". */
  label?: string;
  value: string;
  options: DashboardFilterOption[];
  onValueChange: (value: string) => void;
  align?: "start" | "end";
  className?: string;
};

export function DashboardFilterMenu({ label, value, options, onValueChange, align = "start", className }: DashboardFilterMenuProps) {
  const currentLabel = options.find((option) => option.value === value)?.label ?? value;

  return (
    <DashboardMenu>
      <DashboardMenuTrigger asChild>
        <DashboardButton
          variant="secondary"
          size="sm"
          aria-label={label ? `${label}: ${currentLabel}` : undefined}
          className={cn("group gap-0 overflow-hidden px-0", className)}
        >
          {label && (
            <>
              <span className="px-[9px] font-normal text-(--obsidian-dashboard-shell-text-subtle)">{label}</span>
              <span aria-hidden className="h-full w-px bg-(--obsidian-dashboard-shell-border)" />
            </>
          )}
          <span className="flex items-center gap-1.5 px-[9px]">
            {currentLabel}
            <ChevronDown
              aria-hidden
              className="text-(--obsidian-dashboard-shell-text-subtle) transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </span>
        </DashboardButton>
      </DashboardMenuTrigger>
      <DashboardMenuContent align={align} className="min-w-44">
        {label && <DashboardMenuLabel>{label}</DashboardMenuLabel>}
        <DashboardMenuRadioGroup value={value} onValueChange={onValueChange}>
          {options.map((option) => (
            <DashboardMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DashboardMenuRadioItem>
          ))}
        </DashboardMenuRadioGroup>
      </DashboardMenuContent>
    </DashboardMenu>
  );
}

// Duo icons ship their own bundled SVG prop types, so accept any element type rather than a narrow props shape.
type NavIcon = ElementType;

export type DashboardShellNavItem = {
  id: string;
  label: string;
  /** A duo-icons or lucide icon, or any component that accepts `className`. */
  icon?: NavIcon;
  /** Shows a colored dot instead of an icon, for projects or pipelines. */
  color?: string;
  count?: number;
  /** Renders a link. Without it the item is a button that only changes the active item. */
  href?: string;
};

export type DashboardShellNavSection = {
  id: string;
  title?: string;
  items: DashboardShellNavItem[];
};

export type DashboardShellTab = { value: string; label: string };

export type DashboardShellStatusTone = "success" | "warning" | "neutral";

export type DashboardShellProps = Omit<ComponentProps<"div">, "title" | "children" | "ref"> & {
  brand: { name: string; description?: string; logo?: ReactNode };
  navigation: DashboardShellNavSection[];
  /** Low-emphasis items pinned under the navigation, such as Invite or Help. */
  secondaryNavigation?: DashboardShellNavItem[];
  /** Pinned to the bottom of the sidebar, for a plan or trial card. */
  sidebarFooter?: ReactNode;
  activeItemId?: string;
  defaultActiveItemId?: string;
  onActiveItemChange?: (id: string) => void;
  title: ReactNode;
  headingLevel?: 1 | 2 | 3;
  /** A short label in a pill beside the title, such as "Active". */
  status?: string;
  statusTone?: DashboardShellStatusTone;
  /** Buttons on the right of the header: search, notifications, profile. */
  headerActions?: ReactNode;
  tabs?: DashboardShellTab[];
  tab?: string;
  defaultTab?: string;
  onTabChange?: (value: string) => void;
  /** Left side of the toolbar, usually `DashboardFilterMenu`s. */
  filters?: ReactNode;
  /** Right side of the toolbar, such as Export and New. */
  toolbarActions?: ReactNode;
  children?: ReactNode;
  sidebarWidth?: number;
  defaultSidebarWidth?: number;
  /** Called with the new width when a drag ends or the width changes from the keyboard. */
  onSidebarWidthChange?: (width: number) => void;
  minSidebarWidth?: number;
  maxSidebarWidth?: number;
  navigationLabel?: string;
  /** Renders navigation items that have an `href`, such as Next.js `Link` for client-side routing. Defaults to `<a>`. */
  linkComponent?: ElementType;
};

const ShellLinkContext = createContext<ElementType>("a");

function useControllableState<T>(value: T | undefined, defaultValue: T, onChange?: (next: T) => void) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const isControlled = value !== undefined;
  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setUncontrolledValue(next);
      onChange?.(next);
    },
    [isControlled, onChange],
  );
  return [isControlled ? value : uncontrolledValue, setValue] as const;
}

/** Wraps Tab and Shift+Tab inside the drawer, since the page around the shell is not inert. */
function keepFocusInside(event: KeyboardEvent<HTMLElement>) {
  const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const statusToneClasses: Record<DashboardShellStatusTone, string> = {
  success: "text-(--obsidian-dashboard-shell-success)",
  warning: "text-(--obsidian-dashboard-shell-warning)",
  neutral: "text-(--obsidian-dashboard-shell-text-subtle)",
};

export function DashboardShell({
  brand,
  navigation,
  secondaryNavigation,
  sidebarFooter,
  activeItemId,
  defaultActiveItemId,
  onActiveItemChange,
  title,
  headingLevel = 1,
  status,
  statusTone = "success",
  headerActions,
  tabs,
  tab,
  defaultTab,
  onTabChange,
  filters,
  toolbarActions,
  children,
  sidebarWidth,
  defaultSidebarWidth = 200,
  onSidebarWidthChange,
  minSidebarWidth = 180,
  maxSidebarWidth = 400,
  navigationLabel = "Navigation",
  linkComponent = "a",
  className,
  style,
  ...props
}: DashboardShellProps) {
  const reduceMotion = useReducedMotion();
  const uid = useId();
  const titleId = `${uid}-title`;
  const sidebarId = `${uid}-sidebar`;
  const drawerId = `${uid}-drawer`;
  const rootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusOnClose = useRef(false);
  const drag = useRef<{ startX: number; startWidth: number; width: number } | null>(null);
  const tabPillId = `${uid}-tab-pill`;
  const contentRef = useRef<HTMLDivElement>(null);

  const [activeItem, setActiveItem] = useControllableState(activeItemId, defaultActiveItemId ?? navigation[0]?.items[0]?.id, onActiveItemChange);
  const [activeTab, setActiveTab] = useControllableState(tab, defaultTab ?? tabs?.[0]?.value ?? "", onTabChange);
  const [committedWidth, setCommittedWidth] = useControllableState(sidebarWidth, defaultSidebarWidth, onSidebarWidthChange);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const shownTab = useRef(activeTab);
  const isDark = useScopedDark(rootRef, className);

  // The content stays mounted across tabs, so it animates in place rather than remounting and losing its state.
  useEffect(() => {
    if (shownTab.current === activeTab) return;
    shownTab.current = activeTab;
    const content = contentRef.current;
    if (!content || reduceMotion) return;
    const controls = animate(
      content,
      { opacity: [0, 1], y: [6, 0], filter: ["blur(4px)", "blur(0px)"] },
      { duration: 0.32, ease: EASE_OUT },
    );
    // A leftover transform or filter would make the scroll area the containing block for fixed-position content.
    controls.then(() => {
      content.style.removeProperty("transform");
      content.style.removeProperty("filter");
    });
    return () => controls.stop();
  }, [activeTab, reduceMotion]);

  const clampWidth = (width: number) => Math.round(Math.min(maxSidebarWidth, Math.max(minSidebarWidth, width)));
  const width = clampWidth(dragWidth ?? committedWidth);

  const commitWidth = (next: number) => {
    const clamped = clampWidth(next);
    if (clamped !== committedWidth) setCommittedWidth(clamped);
  };

  const closeDrawer = useCallback(() => {
    restoreFocusOnClose.current = true;
    setIsDrawerOpen(false);
  }, []);

  // The content is inert while the drawer is open, so focus can only move back once it re-renders.
  useEffect(() => {
    if (isDrawerOpen) {
      closeButtonRef.current?.focus();
    } else if (restoreFocusOnClose.current) {
      restoreFocusOnClose.current = false;
      menuButtonRef.current?.focus();
    }
  }, [isDrawerOpen]);

  // A container that widens past the docking width hides the drawer with CSS; close it too so the content is not left inert.
  useEffect(() => {
    const root = rootRef.current;
    if (!isDrawerOpen || !root || typeof ResizeObserver === "undefined") return;
    const dockedWidth = DOCKED_SIDEBAR_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width >= dockedWidth) setIsDrawerOpen(false);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [isDrawerOpen]);

  // Stable handlers let the memoized sidebar skip the re-render on every resize frame,
  // which would otherwise make the active pill spring after the width.
  const selectItem = setActiveItem;
  const selectItemFromDrawer = useCallback(
    (id: string) => {
      setActiveItem(id);
      closeDrawer();
    },
    [closeDrawer, setActiveItem],
  );

  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, width };
    setDragWidth(width);
  };

  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.width = clampWidth(drag.current.startWidth + event.clientX - drag.current.startX);
    setDragWidth(drag.current.width);
  };

  const handleResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const finalWidth = drag.current.width;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragWidth(null);
    commitWidth(finalWidth);
  };

  const handleResizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: width - RESIZE_STEP,
      ArrowRight: width + RESIZE_STEP,
      Home: minSidebarWidth,
      End: maxSidebarWidth,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    commitWidth(targets[event.key]);
  };

  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  const sidebarProps = { brand, navigation, secondaryNavigation, footer: sidebarFooter, activeItemId: activeItem, navigationLabel };

  const renderHeader = (tabList?: ReactNode) => (
    <header className="shrink-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <DashboardButton
            ref={menuButtonRef}
            variant="secondary"
            size="icon"
            className="@2xl/dashboard-shell:hidden"
            aria-label="Open navigation"
            aria-expanded={isDrawerOpen}
            aria-controls={isDrawerOpen ? drawerId : undefined}
            onClick={() => setIsDrawerOpen(true)}
          >
            <Menu aria-hidden />
          </DashboardButton>
          <Heading id={titleId} className="truncate text-base font-medium leading-none tracking-normal">
            {title}
          </Heading>
          {status && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-(--obsidian-dashboard-shell-border-strong) bg-(--obsidian-dashboard-shell-muted) py-[3px] pl-[3px] pr-[6px] text-xs leading-none">
              <span aria-hidden className={cn("relative flex size-3 items-center justify-center", statusToneClasses[statusTone])}>
                <span className="absolute inset-0 rounded-full bg-current opacity-25" />
                <span className="size-1.5 rounded-full bg-current" />
              </span>
              {status}
            </span>
          )}
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-2">{headerActions}</div>}
      </div>
      {tabList}
    </header>
  );

  const body = (
    <>
      {(filters || toolbarActions) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 p-4">
          {filters && <div className="flex min-w-0 flex-wrap items-center gap-2">{filters}</div>}
          {toolbarActions && <div className="ml-auto flex shrink-0 items-center gap-1">{toolbarActions}</div>}
        </div>
      )}
      <div ref={contentRef} className="obsidian-dashboard-shell-scroll min-h-0 flex-1 overflow-auto">
        {children}
      </div>
    </>
  );

  return (
    <ShellDarkContext.Provider value={isDark}>
      <ShellLinkContext.Provider value={linkComponent}>
        <div
          ref={rootRef}
          {...props}
          data-resizing={dragWidth !== null ? "" : undefined}
          className={cn(
            "obsidian-dashboard-shell @container/dashboard-shell relative flex h-full min-h-0 w-full overflow-hidden bg-(--obsidian-dashboard-shell-background) text-(--obsidian-dashboard-shell-foreground)",
            className,
          )}
          style={{ "--obsidian-dashboard-shell-sidebar-width": `${width}px`, ...style } as CSSProperties}
        >
          <aside
            id={sidebarId}
            className="relative hidden w-(--obsidian-dashboard-shell-sidebar-width) shrink-0 flex-col border-r border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-sidebar) @2xl/dashboard-shell:flex"
          >
            <SidebarContent {...sidebarProps} onSelect={selectItem} />
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize sidebar"
              aria-controls={sidebarId}
              aria-valuemin={minSidebarWidth}
              aria-valuemax={maxSidebarWidth}
              aria-valuenow={width}
              tabIndex={0}
              onPointerDown={handleResizeStart}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeEnd}
              onPointerCancel={handleResizeEnd}
              onDoubleClick={() => commitWidth(defaultSidebarWidth)}
              onKeyDown={handleResizeKey}
              className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none select-none"
            >
              <span
                aria-hidden
                className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150 group-hover:bg-(--obsidian-dashboard-shell-border-strong) group-focus-visible:w-0.5 group-focus-visible:bg-(--obsidian-dashboard-shell-ring) group-active:bg-(--obsidian-dashboard-shell-ring)"
              />
            </div>
          </aside>

          <section aria-labelledby={titleId} inert={isDrawerOpen} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {tabs?.length ? (
              <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                {renderHeader(
                  <TabsPrimitive.List aria-labelledby={titleId} className="border-b border-(--obsidian-dashboard-shell-border) px-3 pb-2.5">
                    <HoverHighlightList className="flex flex-wrap items-center gap-1" highlightClassName="rounded-md bg-(--obsidian-dashboard-shell-hover)">
                      {tabs.map((item) => (
                        <ShellTab key={item.value} item={item} isActive={item.value === activeTab} pillId={tabPillId} />
                      ))}
                    </HoverHighlightList>
                  </TabsPrimitive.List>,
                )}
                <TabsPrimitive.Content value={activeTab} className="flex min-h-0 flex-1 flex-col outline-none">
                  {body}
                </TabsPrimitive.Content>
              </TabsPrimitive.Root>
            ) : (
              <>
                {renderHeader()}
                {body}
              </>
            )}
          </section>

          <AnimatePresence>
            {isDrawerOpen && (
              <motion.div
                key="drawer"
                className="absolute inset-0 z-30 @2xl/dashboard-shell:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE_OUT }}
              >
                <div aria-hidden className="absolute inset-0 bg-black/40" onClick={closeDrawer} />
                <motion.div
                  id={drawerId}
                  role="dialog"
                  aria-modal="true"
                  aria-label={navigationLabel}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      closeDrawer();
                    } else if (event.key === "Tab") {
                      keepFocusInside(event);
                    }
                  }}
                  className="absolute inset-y-0 left-0 flex w-[254px] max-w-[85%] flex-col border-r border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-sidebar) shadow-[0_16px_40px_rgb(0_0_0/0.35)]"
                  initial={{ x: reduceMotion ? 0 : "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: reduceMotion ? 0 : "-100%" }}
                  transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASE_OUT }}
                >
                  <SidebarContent {...sidebarProps} onSelect={selectItemFromDrawer} onClose={closeDrawer} closeButtonRef={closeButtonRef} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ShellLinkContext.Provider>
    </ShellDarkContext.Provider>
  );
}


type HoverHighlight = { show: (element: HTMLElement) => void; hide: () => void };

const HoverHighlightContext = createContext<HoverHighlight | null>(null);

/**
 * One hover highlight for a whole list. It glides from item to item after the pointer,
 * and appears in place when the pointer arrives from outside the list.
 */
function HoverHighlightList({
  className,
  highlightClassName = "rounded-lg bg-(--obsidian-dashboard-shell-hover)",
  children,
}: {
  className?: string;
  highlightClassName?: string;
  children: ReactNode;
}) {
  const reduceMotion = !!useReducedMotion();
  const listRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const [isVisible, setIsVisible] = useState(false);
  const isShown = useRef(false);
  const hiddenAt = useRef(0);

  const show = useCallback(
    (element: HTMLElement) => {
      const list = listRef.current;
      if (!list) return;
      // Layout offsets rather than client rects, so a menu that is still scaling in doesn't skew the position.
      let top = 0;
      let left = 0;
      for (let node: HTMLElement | null = element; node && node !== list; node = node.offsetParent as HTMLElement | null) {
        top += node.offsetTop;
        left += node.offsetLeft;
      }
      // Leaving and re-entering quickly still glides, so a pointer that grazes a border doesn't make it blink.
      const glide = !reduceMotion && (isShown.current || performance.now() - hiddenAt.current < 150);
      const moveTo = (value: typeof x, target: number) => (glide ? animate(value, target, FOLLOW_SPRING) : value.jump(target));
      moveTo(x, left);
      moveTo(y, top);
      moveTo(width, element.offsetWidth);
      moveTo(height, element.offsetHeight);
      isShown.current = true;
      setIsVisible(true);
    },
    [height, reduceMotion, width, x, y],
  );

  const hide = useCallback(() => {
    if (!isShown.current) return;
    isShown.current = false;
    hiddenAt.current = performance.now();
    setIsVisible(false);
  }, []);

  const highlight = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <HoverHighlightContext.Provider value={highlight}>
      <div ref={listRef} className={cn("relative", className)} onPointerLeave={hide}>
        <motion.span
          aria-hidden
          className={cn("pointer-events-none absolute left-0 top-0", highlightClassName)}
          style={{ x, y, width, height }}
          initial={false}
          animate={{ opacity: isVisible ? 1 : 0 }}
          transition={{ duration: isVisible ? 0.12 : 0.15, ease: "easeOut" }}
        />
        {children}
      </div>
    </HoverHighlightContext.Provider>
  );
}

type SidebarContentProps = {
  brand: DashboardShellProps["brand"];
  navigation: DashboardShellNavSection[];
  secondaryNavigation?: DashboardShellNavItem[];
  footer?: ReactNode;
  activeItemId?: string;
  navigationLabel: string;
  onSelect: (id: string) => void;
  onClose?: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
};

const SidebarContent = memo(function SidebarContent({
  brand,
  navigation,
  secondaryNavigation,
  footer,
  activeItemId,
  navigationLabel,
  onSelect,
  onClose,
  closeButtonRef,
}: SidebarContentProps) {
  // Each sidebar instance (docked and drawer) needs its own pill, or the pill would jump between them.
  const pillId = useId();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-panel) p-3">
        {brand.logo && <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden">{brand.logo}</span>}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="block truncate text-sm font-medium leading-none tracking-[-0.01em]">{brand.name}</span>
          {brand.description && (
            <span className="block truncate text-xs leading-none text-(--obsidian-dashboard-shell-text-subtle)">{brand.description}</span>
          )}
        </div>
        {onClose && (
          <DashboardButton ref={closeButtonRef} variant="ghost" size="icon" aria-label="Close navigation" onClick={onClose}>
            <X aria-hidden />
          </DashboardButton>
        )}
      </div>

      <motion.nav
        layoutScroll
        aria-label={navigationLabel}
        className="obsidian-dashboard-shell-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <HoverHighlightList>
          {navigation.map((section, index) => (
            <NavSection
              key={section.id}
              title={section.title}
              items={section.items}
              activeItemId={activeItemId}
              pillId={pillId}
              onSelect={onSelect}
              className={index < navigation.length - 1 ? "border-b border-(--obsidian-dashboard-shell-border)" : undefined}
            />
          ))}
        </HoverHighlightList>
      </motion.nav>

      {secondaryNavigation && secondaryNavigation.length > 0 && (
        <HoverHighlightList className="shrink-0 border-t border-(--obsidian-dashboard-shell-border)">
          <NavSection items={secondaryNavigation} activeItemId={activeItemId} pillId={pillId} onSelect={onSelect} isQuiet />
        </HoverHighlightList>
      )}

      {footer && (
        <div className="shrink-0 border-t border-(--obsidian-dashboard-shell-border) bg-(--obsidian-dashboard-shell-panel) p-4">{footer}</div>
      )}
    </div>
  );
});

type NavSectionProps = {
  title?: string;
  items: DashboardShellNavItem[];
  activeItemId?: string;
  pillId: string;
  onSelect: (id: string) => void;
  isQuiet?: boolean;
  className?: string;
};

function NavSection({ title, items, activeItemId, pillId, onSelect, isQuiet = false, className }: NavSectionProps) {
  const titleId = useId();

  return (
    <div className={cn("flex flex-col gap-1 p-3", className)}>
      {title && (
        <span id={titleId} className="block py-1 text-xs font-medium uppercase leading-none tracking-[1px] text-(--obsidian-dashboard-shell-text-subtle)">
          {title}
        </span>
      )}
      <ul aria-labelledby={title ? titleId : undefined} className="flex flex-col gap-px">
        {items.map((item) => (
          <NavItem key={item.id} item={item} isActive={item.id === activeItemId} isQuiet={isQuiet} pillId={pillId} onSelect={onSelect} />
        ))}
      </ul>
    </div>
  );
}

type NavItemProps = {
  item: DashboardShellNavItem;
  isActive: boolean;
  isQuiet: boolean;
  pillId: string;
  onSelect: (id: string) => void;
};

function NavItem({ item, isActive, isQuiet, pillId, onSelect }: NavItemProps) {
  const highlight = useContext(HoverHighlightContext);
  const linkComponent = useContext(ShellLinkContext);
  const reduceMotion = useReducedMotion();
  const Icon = item.icon;

  const shared = {
    "data-active": isActive,
    "aria-current": isActive ? ("page" as const) : undefined,
    onClick: () => onSelect(item.id),
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch") highlight?.show(event.currentTarget);
    },
    className: cn(
      "group relative flex h-8 w-full cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-sm font-medium leading-none outline-none",
      "transition-[color,scale] duration-150 hover:text-(--obsidian-dashboard-shell-foreground) active:scale-[0.98] active:duration-75 focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) data-[active=true]:text-(--obsidian-dashboard-shell-foreground)",
      isQuiet ? "text-(--obsidian-dashboard-shell-text-subtle)" : "text-(--obsidian-dashboard-shell-text-muted)",
    ),
  };

  const content = (
    <>
      {isActive && (
        <motion.span
          layoutId={pillId}
          aria-hidden
          className="absolute inset-0 rounded-lg bg-(--obsidian-dashboard-shell-muted) shadow-(--obsidian-dashboard-shell-control-shadow)"
          transition={reduceMotion ? { duration: 0 } : PILL_SPRING}
        />
      )}
      {Icon ? (
        <Icon aria-hidden className="relative size-4 shrink-0 text-(--obsidian-dashboard-shell-icon)" />
      ) : item.color ? (
        <span aria-hidden className="relative flex size-4 shrink-0 items-center justify-center">
          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
        </span>
      ) : null}
      <span className="relative min-w-0 flex-1 truncate text-left">{item.label}</span>
      {item.count !== undefined && (
        <span className="relative inline-flex h-4 min-w-6 shrink-0 items-center justify-center rounded-[5px] border-[0.5px] border-(--obsidian-dashboard-shell-border-strong) bg-(--obsidian-dashboard-shell-muted) px-1 text-[11px] font-normal leading-none tabular-nums text-(--obsidian-dashboard-shell-text-muted)">
          {item.count}
        </span>
      )}
    </>
  );

  return (
    <li>
      {item.href ? (
        // The link component comes from the app, usually next/link, and keeps its identity between renders.
        createElement(linkComponent, { href: item.href, ...shared }, content)
      ) : (
        <button type="button" {...shared}>
          {content}
        </button>
      )}
    </li>
  );
}

type ShellTabProps = { item: DashboardShellTab; isActive: boolean; pillId: string };

function ShellTab({ item, isActive, pillId }: ShellTabProps) {
  const highlight = useContext(HoverHighlightContext);
  const reduceMotion = useReducedMotion();

  return (
    <TabsPrimitive.Trigger
      value={item.value}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") highlight?.show(event.currentTarget);
      }}
      className="group relative grid h-7 cursor-pointer select-none place-items-center rounded-md px-2.5 text-xs leading-none text-(--obsidian-dashboard-shell-text-subtle) outline-none transition-[color,scale] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] hover:text-(--obsidian-dashboard-shell-foreground) focus-visible:ring-2 focus-visible:ring-(--obsidian-dashboard-shell-ring) active:scale-[0.97] active:duration-75 data-[state=active]:text-(--obsidian-dashboard-shell-foreground)"
    >
      {isActive && (
        <motion.span
          layoutId={pillId}
          aria-hidden
          className="absolute inset-0 rounded-md bg-(--obsidian-dashboard-shell-muted) shadow-(--obsidian-dashboard-shell-control-shadow)"
          transition={reduceMotion ? { duration: 0 } : PILL_SPRING}
        />
      )}
      {/* The hidden bold copy reserves the active width so the row never shifts. */}
      <span aria-hidden className="invisible relative col-start-1 row-start-1 font-medium">
        {item.label}
      </span>
      <span className="relative col-start-1 row-start-1 group-data-[state=active]:font-medium">{item.label}</span>
    </TabsPrimitive.Trigger>
  );
}
