// Replaces the Next.js image optimizer. Cards ask for `lbimg://image/?src=<url>&w=<width>` or
// `lbimg://favicon/?domain=<host>`; this fetches the image (through the same private-network guard as
// previews), shrinks PNG and JPEG to the card width, and keeps it on disk so thumbnails load instantly
// and also work offline.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { nativeImage } from "electron";
import { isHttpUrl } from "@/shared/ipc";
import { fetchPublic, PrivateAddressError, readLimited } from "./net-guard";

const WIDTHS = new Set([64, 128, 320, 400, 640, 828, 1080]);
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
// An image that is really gone (404, blocked, not an image) isn't fetched again for a week.
// Network trouble (offline, timeouts, rate limits, server errors) is never remembered as a failure.
const FAILED_MS = 7 * 24 * 60 * 60 * 1000;
const PRUNE_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_CACHE_BYTES = 400 * 1024 * 1024;
const MAX_PARALLEL = 6;

type Meta = { ok: boolean; type?: string; at: number; status?: number; transient?: boolean };

const inFlight = new Map<string, Promise<{ meta: Meta; body?: Buffer }>>();
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>) {
  if (active >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

const notFound = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

/** The remote image and target width a `lbimg://` URL asks for, or null if it isn't a valid request. */
export function parseImageRequest(raw: string): { src: string; width: number } | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.host === "favicon") {
    const domain = url.searchParams.get("domain") ?? "";
    if (!/^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(domain)) return null;
    // Where google.com/s2/favicons redirects to, so each icon skips a round trip.
    const src = `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=${encodeURIComponent(`https://${domain}`)}`;
    return { src, width: 0 };
  }
  if (url.host === "image") {
    const src = url.searchParams.get("src");
    const width = Number(url.searchParams.get("w") ?? 0);
    if (!isHttpUrl(src) || (width !== 0 && !WIDTHS.has(width))) return null;
    return { src, width };
  }
  return null;
}

function resize(body: Buffer, type: string, width: number) {
  if (!width || (type !== "image/png" && type !== "image/jpeg")) return { body, type };
  const image = nativeImage.createFromBuffer(body);
  if (image.isEmpty() || image.getSize().width <= width) return { body, type };
  const smaller = image.resize({ width, quality: "best" });
  return type === "image/png" ? { body: smaller.toPNG(), type } : { body: smaller.toJPEG(82), type };
}

async function download(src: string, width: number): Promise<{ meta: Meta; body?: Buffer }> {
  try {
    const { response } = await withSlot(() => fetchPublic(new URL(src), AbortSignal.timeout(10_000), "image/avif,image/webp,image/*;q=0.8"));
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!response.ok || !type.startsWith("image/")) {
      await response.body?.cancel();
      const transient = response.status === 408 || response.status === 429 || response.status >= 500;
      return { meta: { ok: false, at: Date.now(), status: response.status, transient } };
    }
    const raw = await readLimited(response, MAX_SOURCE_BYTES);
    if (raw.length === 0) return { meta: { ok: false, at: Date.now(), status: response.status } };
    const result = resize(raw, type, width);
    return { meta: { ok: true, type: result.type, at: Date.now() }, body: result.body };
  } catch (error) {
    // A private address will never work; anything else (offline, DNS, timeout) may work later.
    return { meta: { ok: false, at: Date.now(), transient: !(error instanceof PrivateAddressError) } };
  }
}

export function createImageHandler(cacheDir: string) {
  return async (request: Request): Promise<Response> => {
    const parsed = parseImageRequest(request.url);
    if (!parsed) return notFound();

    const key = createHash("sha256").update(`${parsed.src}|${parsed.width}`).digest("hex");
    const metaFile = path.join(cacheDir, `${key}.json`);
    const bodyFile = path.join(cacheDir, `${key}.bin`);

    const cachedMeta = await readFile(metaFile, "utf8")
      .then((text) => JSON.parse(text) as Meta)
      .catch(() => null);
    const age = cachedMeta ? Date.now() - cachedMeta.at : Infinity;
    if (cachedMeta?.ok && age < FRESH_MS) {
      const body = await readFile(bodyFile).catch(() => null);
      if (body) return new Response(Uint8Array.from(body), { headers: { "content-type": cachedMeta.type ?? "application/octet-stream", "cache-control": "private, max-age=86400" } });
    }
    if (cachedMeta && !cachedMeta.ok && age < FAILED_MS) return notFound();

    let pending = inFlight.get(key);
    if (!pending) {
      pending = download(parsed.src, parsed.width).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    const { meta, body } = await pending;

    // Offline or unreachable: an older cached copy is better than nothing.
    if (!meta.ok && cachedMeta?.ok) {
      const stale = await readFile(bodyFile).catch(() => null);
      if (stale) return new Response(Uint8Array.from(stale), { headers: { "content-type": cachedMeta.type ?? "application/octet-stream" } });
    }

    if (!meta.ok && meta.transient) return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });

    await mkdir(cacheDir, { recursive: true });
    if (body) await writeFile(bodyFile, body);
    await writeFile(metaFile, JSON.stringify(meta));
    if (!meta.ok || !body) return notFound();
    return new Response(Uint8Array.from(body), { headers: { "content-type": meta.type ?? "application/octet-stream", "cache-control": "private, max-age=86400" } });
  };
}

/** Drops cached images that are old or push the cache over its size limit, oldest first. */
export async function pruneImageCache(cacheDir: string) {
  const names = await readdir(cacheDir).catch(() => [] as string[]);
  const entries = await Promise.all(
    names.map(async (name) => {
      const info = await stat(path.join(cacheDir, name)).catch(() => null);
      return info ? { name, size: info.size, mtime: info.mtimeMs } : null;
    }),
  );
  const files = entries.filter((entry): entry is NonNullable<typeof entry> => !!entry).sort((a, b) => b.mtime - a.mtime);
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (total > MAX_CACHE_BYTES || Date.now() - file.mtime > PRUNE_AGE_MS) await rm(path.join(cacheDir, file.name), { force: true });
  }
}
