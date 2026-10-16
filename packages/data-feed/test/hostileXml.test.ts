import { describe, expect, test } from "vitest";
import { FeedLimits, loadFeedData } from "../src/index.js";
import { failure, rss, stubFetch, xml } from "./stubFetch.js";

const URL_SOURCE = "https://feed.example/rss.xml";

async function refused(body: string | Uint8Array<ArrayBuffer>, maxBytes?: number) {
  const stub = stubFetch(() => xml(body));
  const started = performance.now();
  const error = await failure(
    loadFeedData({
      url: URL_SOURCE,
      fetch: stub.fetch,
      ...(maxBytes === undefined ? {} : { maxBytes }),
    }),
  );
  return { error, requests: stub.calls.length, elapsed: performance.now() - started };
}

const BILLION_LAUGHS = `<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
 <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
 <!ENTITY lol9 "&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;&lol4;">
]>
<rss version="2.0"><channel><title>&lol9;</title></channel></rss>`;

describe("DTDs and entities are never expanded", () => {
  test.each([
    ["billion laughs", BILLION_LAUGHS],
    [
      "an external SYSTEM entity",
      '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss version="2.0"><channel><title>&xxe;</title></channel></rss>',
    ],
    [
      "an external parameter entity",
      '<!DOCTYPE rss [<!ENTITY % remote SYSTEM "https://evil.example/x.dtd"> %remote;]><rss version="2.0"/>',
    ],
    [
      "a public DOCTYPE",
      '<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//EN" "http://my.netscape.example/rss-0.91.dtd"><rss version="0.91"><channel/></rss>',
    ],
    ["a DOCTYPE after the root", `${rss("")}<!DOCTYPE rss>`],
    ["an ENTITY declaration inside the root", rss('<!ENTITY lol "lol">')],
  ])("%s is invalid-response after exactly one request, at once", async (_name, body) => {
    const { error, requests, elapsed } = await refused(body);
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe(
      "The feed document has a DOCTYPE or another markup declaration; DTDs and entity declarations are refused.",
    );
    expect(requests).toBe(1);
    expect(elapsed).toBeLessThan(5000);
  });

  test("an entity beyond the five predefined is refused, never looked up on a prototype", async () => {
    for (const name of ["foo", "nbsp", "valueOf", "__proto__", "toString"]) {
      const { error } = await refused(rss(`<item><title>&${name};</title></item>`));
      expect(error.code, name).toBe("invalid-response");
      expect(error.message, name).toContain("entity other than the five predefined");
    }
    // Longer than any reference XML defines: refused before the name is looked at.
    const { error } = await refused(rss("<item><title>&constructor;</title></item>"));
    expect(error.message).toContain("unterminated entity reference");
  });
});

describe("well-formedness", () => {
  test.each([
    ["&#0;", rss("<item><title>&#0;</title></item>")],
    ["&#xD800;", rss("<item><title>&#xD800;</title></item>")],
    ["&#x110000;", rss("<item><title>&#x110000;</title></item>")],
    ["an unterminated entity", rss("<item><title>a &amp b</title></item>")],
    ["mismatched tags", '<rss version="2.0"><channel></rss></channel>'],
    ["two roots", `${rss("")}${rss("")}`],
    ["text after the root", `${rss("")} trailing`],
    ["< in an attribute", '<rss version="<2"><channel/></rss>'],
    ["a duplicate attribute", '<rss version="2.0" version="2.0"><channel/></rss>'],
    [
      "a duplicate attribute by namespace",
      '<rss xmlns:a="urn:x" xmlns:b="urn:x" a:v="1" b:v="2"><channel/></rss>',
    ],
    ["an unbound prefix", '<rss version="2.0"><channel><x:item/></channel></rss>'],
    ["an unbound attribute prefix", '<rss x:version="2.0"><channel/></rss>'],
    ["an unquoted attribute", "<rss version=2.0><channel/></rss>"],
    ["an unclosed root", '<rss version="2.0"><channel/>'],
    ["an unclosed comment", `${rss("")}<!-- open`],
    ["an empty document", ""],
    ["a control character", rss("<item><title>a\u0001b</title></item>")],
    ["an XML declaration not at the start", `${rss("")}<?xml version="1.0"?>`],
    ["the xmlns prefix bound", '<rss xmlns:xmlns="urn:x"><channel/></rss>'],
  ])("%s is invalid-response", async (_name, body) => {
    const { error } = await refused(body);
    expect(error.code).toBe("invalid-response");
  });

  test("a declared ISO-8859-1 encoding is refused", async () => {
    const { error } = await refused(`<?xml version="1.0" encoding="ISO-8859-1"?>${rss("")}`);
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe("The feed document declares an encoding other than UTF-8.");
  });

  test("UTF-16 and invalid UTF-8 bytes are refused as not UTF-8", async () => {
    const text = `<?xml version="1.0" encoding="UTF-16"?>${rss("")}`;
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let index = 0; index < text.length; index += 1)
      utf16[2 + index * 2] = text.charCodeAt(index);
    const invalid = new TextEncoder().encode(rss("<item><title>x</title></item>"));
    invalid[invalid.indexOf(0x78)] = 0xff;
    for (const body of [utf16, invalid]) {
      const { error } = await refused(body);
      expect(error.code).toBe("invalid-response");
      expect(error.message).toBe("The feed document is not valid UTF-8.");
    }
  });
});

describe("caps", () => {
  test("32 levels load; 33 are too-large", async () => {
    const nested = (depth: number) => rss(`${"<x>".repeat(depth - 2)}${"</x>".repeat(depth - 2)}`);
    await expect(
      loadFeedData({ url: URL_SOURCE, fetch: stubFetch(() => xml(nested(32))).fetch }),
    ).resolves.toBeDefined();
    const { error } = await refused(nested(33));
    expect(error.code).toBe("too-large");
    expect(error.message).toContain("deeper than 32 levels");
  });

  test("10000 levels fail fast without a stack overflow", async () => {
    const { error, elapsed } = await refused(`${"<a>".repeat(10_000)}${"</a>".repeat(10_000)}`);
    expect(error.code).toBe("too-large");
    expect(elapsed).toBeLessThan(5000);
  });

  test("more than 100000 elements are too-large", async () => {
    const { error } = await refused(
      rss("<i/>".repeat(FeedLimits.maxElements)),
      FeedLimits.maxMaxBytes,
    );
    expect(error.code).toBe("too-large");
    expect(error.message).toContain("100000 elements");
  });

  test("65 attributes are too-large; 64 load", async () => {
    const attributes = (count: number) =>
      Array.from({ length: count }, (_, index) => ` a${String(index)}="v"`).join("");
    await expect(
      loadFeedData({
        url: URL_SOURCE,
        fetch: stubFetch(() => xml(rss(`<item${attributes(64)}/>`))).fetch,
      }),
    ).resolves.toBeDefined();
    const { error } = await refused(rss(`<item${attributes(65)}/>`));
    expect(error.code).toBe("too-large");
    expect(error.message).toContain("64 attributes");
  });

  test("a 257-character name is too-large; 256 load", async () => {
    const named = (length: number) => rss(`<${"n".repeat(length)}/>`);
    await expect(
      loadFeedData({ url: URL_SOURCE, fetch: stubFetch(() => xml(named(256))).fetch }),
    ).resolves.toBeDefined();
    const { error } = await refused(named(257));
    expect(error.code).toBe("too-large");
    expect(error.message).toContain("256 characters");
  });

  test("a flat 8 MiB document of references and attributes parses in linear time", async () => {
    const item = '<item a="&amp;&lt;&#x41;"><title>&amp;&#65;&gt; x</title></item>';
    // About 42000 items (84000 elements, under the cap) and 3 MB of references in one text.
    const body = rss(item.repeat(Math.floor((8 * 1024 * 1024) / item.length / 3)));
    const text = `<description>${"&amp;x".repeat(500_000)}</description>`;
    const started = performance.now();
    const { data } = await loadFeedData({
      url: URL_SOURCE,
      maxBytes: FeedLimits.maxMaxBytes,
      fetch: stubFetch(() => xml(body.replace("<link>", `${text}<link>`))).fetch,
    });
    expect(data.entries).toHaveLength(5);
    expect(performance.now() - started).toBeLessThan(15_000);
  });
});

test("no message quotes the document", async () => {
  const marker = "DOCUMENT-TEXT-1234";
  const bodies = [
    `<!DOCTYPE ${marker}>${rss("")}`,
    rss(`<item><title>&${marker};</title></item>`),
    `<rss version="2.0"><${marker}></rss>`,
    `${rss("")}${marker}`,
    `<${marker} a="1" a="2"/>`,
    `<${marker}/>`,
  ];
  for (const body of bodies) {
    const { error } = await refused(body);
    expect(error.message).not.toContain(marker);
    expect(String(error)).not.toContain(marker);
    expect(JSON.stringify(error)).not.toContain(marker);
  }
});
