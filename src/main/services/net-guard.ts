import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const MAX_REDIRECTS = 4;

/** Set LINKBOOK_OFFLINE=1 to keep the app from contacting any site (previews, GitHub stats, images). */
export const offline = process.env.LINKBOOK_OFFLINE === "1";

export class OfflineError extends Error {
  constructor() {
    super("Network access is turned off (LINKBOOK_OFFLINE=1)");
    this.name = "OfflineError";
  }
}

export class PrivateAddressError extends Error {
  constructor() {
    super("Private address");
    this.name = "PrivateAddressError";
  }
}

// The app fetches whatever link a bookmark points to, so it refuses anything that resolves into a private network.
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isBlockedAddress(address: string) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return blocked.check(mapped, "ipv4");
  return blocked.check(address, isIP(address) === 6 ? "ipv6" : "ipv4");
}

export async function assertPublicUrl(url: URL) {
  if (offline) throw new OfflineError();
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links can be fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new PrivateAddressError();
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) throw new PrivateAddressError();
}

/** Follows redirects by hand, so every hop is checked before it is requested. */
export async function fetchPublic(start: URL, signal: AbortSignal, accept = "text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.5") {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        // Some sites only send their meta tags to browsers.
        "user-agent": "Mozilla/5.0 (compatible; LinkbookPreview/1.0; +https://github.com/linkwarden/linkwarden)",
        accept,
      },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }
    return { response, url };
  }
  throw new Error("Too many redirects");
}

/** Reads a response body up to a size limit, so a huge or endless download can't exhaust memory. */
export async function readLimited(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
