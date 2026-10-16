import { describe, expect, test } from "vitest";
import { loadFeedData } from "../src/index.js";
import { failure, fixture, rss, stubFetch, xml } from "./stubFetch.js";

const URL_SOURCE = "https://blog.example/feed.xml";

const load = (body: string, limit?: number) =>
  loadFeedData({
    url: URL_SOURCE,
    fetch: stubFetch(() => xml(body)).fetch,
    ...(limit === undefined ? {} : { limit }),
  });

describe("RSS 2.0", () => {
  test("a blog feed becomes plain-text entries, newest first", async () => {
    const { data, meta } = await load(fixture("blog.rss.xml"));
    expect(meta).toEqual({ requests: 1, fromCache: false });
    expect(data).toEqual({
      version: 0,
      title: "Mint & Notes",
      link: "https://blog.example/",
      entries: [
        {
          title: "Shipping the feed source",
          link: "https://blog.example/posts/feed-source",
          published: "2026-10-16T12:30:00.000Z",
          summary: "RSS and Atom feeds & more. Second paragraph.",
        },
        {
          title: "A relative link",
          link: "https://blog.example/posts/relative",
          published: "2026-10-14T09:15:00.000Z",
          summary: "Plain text, no markup.",
        },
        {
          title: "Colour management",
          link: "https://blog.example/posts/colour",
          published: "2026-10-13T13:00:00.000Z",
          summary: "Why Chromium and resvg disagree.",
        },
      ],
    });
  });

  test("the data object and its entries are frozen", async () => {
    const { data } = await load(fixture("blog.rss.xml"));
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.entries)).toBe(true);
    expect(data.entries.every((entry) => Object.isFrozen(entry))).toBe(true);
  });

  test("a guid with isPermaLink=false is no link; a missing text is empty", async () => {
    const { data } = await load(
      rss('<item><guid isPermaLink="false">https://x.example/a</guid></item>'),
    );
    expect(data.entries).toEqual([{ title: "", link: "", published: null, summary: "" }]);
  });

  test("a javascript: or data: link is empty, never passed on", async () => {
    const { data } = await load(
      rss(
        "<item><link>javascript:alert(1)</link></item><item><link>data:text/html,x</link></item>",
      ),
    );
    expect(data.entries.map((entry) => entry.link)).toEqual(["", ""]);
  });

  test("a link with credentials or over 2048 characters is empty", async () => {
    const { data } = await load(
      rss(
        `<item><link>https://u:p@x.example/</link></item><item><link>https://x.example/${"a".repeat(2048)}</link></item>`,
      ),
    );
    expect(data.entries.map((entry) => entry.link)).toEqual(["", ""]);
  });

  test("an RSS root without a channel is invalid-response", async () => {
    const error = await failure(load('<rss version="2.0"/>'));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe("The RSS feed has no channel.");
  });

  test("RSS 1.0 (RDF) and any other root are refused", async () => {
    const rdf = await failure(
      load(
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel/></rdf:RDF>',
      ),
    );
    const html = await failure(load("<html><body>Login</body></html>"));
    for (const error of [rdf, html]) {
      expect(error.code).toBe("invalid-response");
      expect(error.message).toBe("The feed document is not an RSS 2.0 or Atom 1.0 feed.");
    }
  });
});
