export type GithubStats = {
  /** "owner/name" as GitHub spells it. */
  fullName: string;
  description?: string;
  stars: number;
  forks: number;
  openIssues: number;
  language?: string;
  /** SPDX id, such as MIT. */
  license?: string;
  /** ISO timestamp of the last push. */
  pushedAt: string;
  archived: boolean;
};

/** Stats as saved on a bookmark, with when they were looked up. */
export type SavedGithubStats = GithubStats & { fetchedAt: string };

/** Stats older than this are looked up again. */
export const GITHUB_STATS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// First path segments that are GitHub's own pages, not owners.
const RESERVED = new Set([
  "about", "apps", "collections", "contact", "customer-stories", "enterprise", "events", "explore", "features", "issues",
  "login", "marketplace", "new", "notifications", "orgs", "pricing", "pulls", "readme", "search", "security", "settings",
  "site", "sponsors", "team", "topics", "trending",
]);

/** "owner/name" when the link points into a GitHub repository (its page, a file, the wiki), otherwise null. */
export function githubRepo(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/^(www\.)?github\.com$/i.test(parsed.hostname)) return null;
  const [owner, name] = parsed.pathname.split("/").filter(Boolean);
  if (!owner || !name || RESERVED.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner)) return null;
  const repo = name.replace(/\.git$/i, "");
  return /^[A-Za-z0-9._-]{1,100}$/.test(repo) ? `${owner}/${repo}` : null;
}

export function isStale(stats: SavedGithubStats | undefined, now: number) {
  return !stats || now - Date.parse(stats.fetchedAt) > GITHUB_STATS_MAX_AGE_MS;
}

// Two at a time keeps a fresh import from spending the whole hourly allowance in a burst.
const MAX_REQUESTS = 2;
let active = 0;
const waiting: (() => void)[] = [];
let pausedUntil = 0;
const requests = new Map<string, Promise<GithubStats | null>>();

async function withSlot<T>(task: () => Promise<T>) {
  if (active >= MAX_REQUESTS) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

/** Repo stats through the server, which caches them. Null when the repo is missing, private, or GitHub's limit is reached. */
export function fetchGithubStats(repo: string) {
  const key = repo.toLowerCase();
  let request = requests.get(key);
  if (!request) {
    request = withSlot(async () => {
      if (Date.now() < pausedUntil) return null;
      // The main process talks to api.github.com and holds the optional token; the window only gets the numbers.
      const result = await window.linkbook.fetchGithubStats(repo).catch(() => null);
      if (!result) return null;
      if (!result.ok && result.code === "rate-limited") {
        pausedUntil = result.resetAt ? Date.parse(result.resetAt) : Date.now() + 15 * 60 * 1000;
        // Lets this repo be asked again after the reset.
        requests.delete(key);
        return null;
      }
      return result.ok ? result.value : null;
    });
    requests.set(key, request);
  }
  return request;
}

export const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
// UTC keeps the server and browser render identical.
export const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
