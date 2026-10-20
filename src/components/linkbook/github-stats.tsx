import { Archive, CircleDot, GitFork, Scale, Star } from "lucide-react";
import { compactNumber, monthYear, type SavedGithubStats } from "@/lib/github";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-US");

/** Stars, forks, open issues, language, and last push for a GitHub repository bookmark. */
export function GithubStatsRow({ stats, compact = false, className }: { stats: SavedGithubStats; compact?: boolean; className?: string }) {
  const item = "inline-flex items-center gap-1 whitespace-nowrap";
  return (
    <div
      aria-label={`GitHub: ${number.format(stats.stars)} stars, ${number.format(stats.forks)} forks, ${number.format(stats.openIssues)} open issues`}
      className={cn("flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] leading-none text-(--obsidian-dashboard-shell-text-muted)", className)}
    >
      <span className={item} title={`${number.format(stats.stars)} stars`}>
        <Star aria-hidden className="size-3" />
        <span className="tabular-nums">{compactNumber.format(stats.stars)}</span>
      </span>
      <span className={item} title={`${number.format(stats.forks)} forks`}>
        <GitFork aria-hidden className="size-3" />
        <span className="tabular-nums">{compactNumber.format(stats.forks)}</span>
      </span>
      {!compact && (
        <span className={item} title={`${number.format(stats.openIssues)} open issues and pull requests`}>
          <CircleDot aria-hidden className="size-3" />
          <span className="tabular-nums">{compactNumber.format(stats.openIssues)}</span>
        </span>
      )}
      {stats.language && (
        <span className={item}>
          <span aria-hidden className="size-2 rounded-full border border-current opacity-70" />
          {stats.language}
        </span>
      )}
      {!compact && stats.license && (
        <span className={item} title="License">
          <Scale aria-hidden className="size-3" />
          {stats.license}
        </span>
      )}
      {stats.archived ? (
        <span className={cn(item, "rounded bg-(--obsidian-dashboard-shell-muted) px-1 py-0.5 text-(--obsidian-dashboard-shell-foreground)")}>
          <Archive aria-hidden className="size-3" />
          Archived
        </span>
      ) : (
        !compact && (
          <time dateTime={stats.pushedAt} className="whitespace-nowrap text-(--obsidian-dashboard-shell-text-subtle)">
            Pushed {monthYear.format(new Date(stats.pushedAt))}
          </time>
        )
      )}
    </div>
  );
}
