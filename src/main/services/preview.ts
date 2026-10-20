// Port of the Next.js route /api/preview: reads a page's title, description, and preview image from its meta tags.
import type { LinkPreview } from "@/lib/bookmarks";
import type { Result } from "@/shared/ipc";
import { fetchPublic, OfflineError, PrivateAddressError } from "./net-guard";

const MAX_HEAD_BYTES = 512 * 1024;
const TIMEOUT_MS = 6000;
const IMAGE_CHECK_TIMEOUT_MS = 4000;
// The route sent "cache-control: max-age=86400"; the desktop app keeps the same answers in memory for a day.
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; result: Result<LinkPreview> }>();

/** Reads the start of the page, which is where the meta tags live. */
async function readHead(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  while (bytes < MAX_HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(html)) break;
  }
  await reader.cancel().catch(() => {});
  return html;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMeta(html: string) {
  const meta = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map<string, string>();
    for (const [, name, , doubleQuoted, singleQuoted, bare] of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attributes.set(name.toLowerCase(), doubleQuoted ?? singleQuoted ?? bare ?? "");
    }
    const key = (attributes.get("property") ?? attributes.get("name") ?? attributes.get("itemprop"))?.toLowerCase();
    const content = attributes.get("content");
    if (key && content && !meta.has(key)) meta.set(key, decodeEntities(content));
  }
  return meta;
}

function absoluteHttpUrl(value: string | undefined, base: URL) {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

type ImageCheck = "ok" | "broken" | "unknown";

/**
 * Many sites list a preview image that 404s, is blocked, is empty, or is really an HTML page.
 * Saving those makes the board ask for them on every visit, so each one is checked first.
 */
async function checkImage(src: string): Promise<ImageCheck> {
  try {
    const { response } = await fetchPublic(new URL(src), AbortSignal.timeout(IMAGE_CHECK_TIMEOUT_MS), "image/*");
    await response.body?.cancel();
    // Rate limits and server errors say nothing about the image itself.
    if (response.status === 429 || response.status >= 500) return "unknown";
    if (!response.ok) return "broken";
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return "broken";
    return response.headers.get("content-length") === "0" ? "broken" : "ok";
  } catch (error) {
    // A private address is never a usable image; a timeout might just be a slow site.
    return error instanceof PrivateAddressError ? "broken" : "unknown";
  }
}

/** The first candidate that is a real image, or the first one that couldn't be checked, or none. */
async function firstWorkingImage(candidates: string[]) {
  let fallback: string | undefined;
  for (const candidate of candidates.slice(0, 3)) {
    const result = await checkImage(candidate);
    if (result === "ok") return candidate;
    if (result === "unknown") fallback ??= candidate;
  }
  return fallback;
}

async function lookupPreview(target: URL): Promise<Result<LinkPreview>> {
  try {
    const { response, url } = await fetchPublic(target, AbortSignal.timeout(TIMEOUT_MS));
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, code: response.status === 404 ? "not-found" : "failed", error: `The site answered ${response.status}` };
    }

    const type = response.headers.get("content-type") ?? "";
    // A link straight to an image is its own preview.
    if (type.startsWith("image/")) {
      await response.body?.cancel();
      return { ok: true, value: { image: url.href } };
    }

    const html = await readHead(response);
    const meta = parseMeta(html);
    const title = meta.get("og:title") ?? meta.get("twitter:title") ?? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
    const candidates = ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"]
      .map((key) => absoluteHttpUrl(meta.get(key), url))
      .filter((value): value is string => !!value);
    return {
      ok: true,
      value: {
        title: title || undefined,
        description: meta.get("og:description") ?? meta.get("twitter:description") ?? meta.get("description"),
        image: await firstWorkingImage([...new Set(candidates)]),
      },
    };
  } catch (error) {
    if (error instanceof OfflineError) return { ok: false, code: "offline", error: error.message };
    if (error instanceof PrivateAddressError) return { ok: false, code: "invalid", error: "Links to private network addresses don't get previews" };
    const message = error instanceof Error && error.name === "TimeoutError" ? "The site took too long to answer" : error instanceof Error ? error.message : "Couldn't read the page";
    return { ok: false, code: "failed", error: message };
  }
}

/** The URL must already be validated as http(s) by the IPC layer. */
export async function fetchLinkPreview(url: string): Promise<Result<LinkPreview>> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.result;
  const result = await lookupPreview(new URL(url));
  // Offline answers aren't cached, so previews start working as soon as the network is back.
  if (result.ok || result.code !== "offline") cache.set(url, { at: Date.now(), result });
  return result;
}
