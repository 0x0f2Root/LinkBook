import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type BookmarkIconProps = Omit<ComponentProps<"svg">, "children"> & { size?: number };

/**
 * The duo-icons Bookmark, copied because @duo-icons/react@1.0.1 passes `fill-rule`
 * instead of `fillRule`, which React reports as an invalid DOM property.
 */
export function BookmarkIcon({ size = 24, className, ...props }: BookmarkIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={cn("duo-icons", className)} {...props}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M17 2a3 3 0 0 1 3 3v16a1 1 0 0 1-1.625.78l-1.875-1.5-1.875 1.5a1 1 0 0 1-1.332-.073L12 20.414l-1.293 1.293a1 1 0 0 1-1.332.074L7.5 20.28l-1.875 1.5A1 1 0 0 1 4 21V5a3 3 0 0 1 3-3z"
        className="duo-icons-secondary-layer"
        opacity=".3"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M15 8H9a1 1 0 0 0-.117 1.993L9 10h6a1 1 0 0 0 .117-1.993zM12 12H9a1 1 0 1 0 0 2h3a1 1 0 1 0 0-2"
        className="duo-icons-primary-layer"
      />
    </svg>
  );
}
