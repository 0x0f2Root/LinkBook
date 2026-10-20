// Port of the Next.js route /api/github: a repository's stars, forks, and more from GitHub's REST API.
import type { GithubStats } from "@/lib/github";
import type { Result } from "@/shared/ipc";
import { offline } from "./net-guard";

const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; stats: GithubStats | null }>();
// When GitHub says the hourly limit is used up, stop asking until it resets.
let blockedUntil = 0;

type RepoResponse = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  license: { spdx_id: string | null; name: string } | null;
  pushed_at: string;
  archived: boolean;
};

const rateLimited = (): Result<GithubStats> => ({ ok: false, code: "rate-limited", error: "GitHub rate limit reached", resetAt: new Date(blockedUntil).toISOString() });

/** The repo must already be validated as "owner/name" by the IPC layer. Only api.github.com is ever contacted. */
export async function fetchGithubStats(repo: string): Promise<Result<GithubStats>> {
  if (offline) return { ok: false, code: "offline", error: "Network access is turned off (LINKBOOK_OFFLINE=1)" };

  const key = repo.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.stats ? { ok: true, value: cached.stats } : { ok: false, code: "not-found", error: "Repository not found" };
  }
  if (Date.now() < blockedUntil) return rateLimited();

  // Optional, read from the environment the app was started in. Without a token GitHub allows
  // 60 lookups an hour per IP; with one, 5,000. It never reaches the renderer.
  const token = process.env.GITHUB_TOKEN;
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}`, {
      signal: AbortSignal.timeout(6000),
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "LinkbookStats/1.0",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    return { ok: false, code: "failed", error: "GitHub didn't answer" };
  }

  if (response.status === 403 || response.status === 429) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    blockedUntil = reset > 0 ? reset * 1000 : Date.now() + 15 * 60 * 1000;
    return rateLimited();
  }
  if (response.status === 404 || response.status === 451) {
    cache.set(key, { at: Date.now(), stats: null });
    return { ok: false, code: "not-found", error: "Repository not found" };
  }
  if (!response.ok) return { ok: false, code: "failed", error: `GitHub answered ${response.status}` };

  const data = (await response.json()) as RepoResponse;
  const stats: GithubStats = {
    fullName: data.full_name,
    description: data.description ?? undefined,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    language: data.language ?? undefined,
    license: data.license?.spdx_id && data.license.spdx_id !== "NOASSERTION" ? data.license.spdx_id : undefined,
    pushedAt: data.pushed_at,
    archived: data.archived,
  };
  cache.set(key, { at: Date.now(), stats });
  return { ok: true, value: stats };
}
