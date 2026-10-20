import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBlockedAddress, PrivateAddressError } from "@/main/services/net-guard";
import { decodeEntities, parseMeta } from "@/main/services/preview";

describe("isBlockedAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "224.0.0.1"])(
    "blocks %s",
    (address) => expect(isBlockedAddress(address)).toBe(true),
  );

  it.each(["1.1.1.1", "140.82.112.3", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it.each(["http://localhost:3000", "http://app.localhost", "http://printer.local", "http://127.0.0.1:8080", "http://[::1]/", "http://169.254.169.254/latest"])(
    "refuses %s without contacting it",
    async (url) => {
      await expect(assertPublicUrl(new URL(url))).rejects.toBeInstanceOf(PrivateAddressError);
    },
  );

  it("refuses non-http protocols", async () => {
    await expect(assertPublicUrl(new URL("file:///etc/passwd"))).rejects.toThrow(/http/);
  });
});

describe("preview meta parsing (ported from /api/preview)", () => {
  it("reads Open Graph, Twitter, and description tags, first one wins", () => {
    const meta = parseMeta(`
      <meta property="og:title" content="First &amp; best">
      <meta property="og:title" content="Second">
      <meta name='twitter:image' content='/img.png'>
      <meta name=description content=plain>`);
    expect(meta.get("og:title")).toBe("First & best");
    expect(meta.get("twitter:image")).toBe("/img.png");
    expect(meta.get("description")).toBe("plain");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(decodeEntities("  A&#x27;s &quot;quote&quot;\n  &#169; &nbsp;x ")).toBe("A's \"quote\" © x");
  });
});
