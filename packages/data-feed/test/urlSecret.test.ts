import { describe, expect, test } from "vitest";
import { loadFeedData, type FeedFetch } from "../src/index.js";
import { failure, redirect, stubFetch, xml } from "./stubFetch.js";

const SECRET = "s3cr3t";
const URL_SOURCE = `https://feed.example/private.xml?key=${SECRET}`;

function expectNoSecret(error: Error): void {
  for (const text of [error.message, String(error), JSON.stringify(error), error.stack ?? ""]) {
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("feed.example");
  }
}

describe("a key in the feed URL never appears in an error", () => {
  const cases: [string, FeedFetch | null, string][] = [
    ["404", stubFetch(() => new Response("", { status: 404 })).fetch, URL_SOURCE],
    [
      "a transport error echoing the URL",
      () => Promise.reject(new TypeError(URL_SOURCE)),
      URL_SOURCE,
    ],
    [
      "a redirect to http",
      stubFetch(() => redirect(`http://feed.example/?key=${SECRET}`)).fetch,
      URL_SOURCE,
    ],
    [
      "a document that is HTML",
      stubFetch(() => xml(`<p>${URL_SOURCE}</p>`, { "content-type": "text/html" })).fetch,
      URL_SOURCE,
    ],
    [
      "a malformed document quoting it",
      stubFetch(() => xml(`<rss>${URL_SOURCE}</channel>`)).fetch,
      URL_SOURCE,
    ],
    ["an http URL", null, `http://feed.example/?key=${SECRET}`],
    ["an overlong URL", null, `${URL_SOURCE}&pad=${"a".repeat(2100)}`],
    ["a URL with credentials", null, `https://user:${SECRET}@feed.example/`],
  ];

  test.each(cases)("%s", async (_name, fetch, url) => {
    const error = await failure(loadFeedData({ url, ...(fetch === null ? {} : { fetch }) }));
    expectNoSecret(error);
  });

  test("relative links never carry the query of the feed URL into the data", async () => {
    const { data } = await loadFeedData({
      url: URL_SOURCE,
      fetch: stubFetch(() =>
        xml(
          '<rss version="2.0"><channel><link>#top</link><item><link>#a</link></item><item><link>?page=2</link></item><item><link>post</link></item></channel></rss>',
        ),
      ).fetch,
    });
    expect(data.link).toBe("https://feed.example/private.xml#top");
    expect(data.entries.map((entry) => entry.link)).toEqual([
      "https://feed.example/private.xml#a",
      "https://feed.example/private.xml?page=2",
      "https://feed.example/post",
    ]);
    expect(JSON.stringify(data)).not.toContain(SECRET);
  });

  test("a foreign error quoting the URL is replaced by fixed text", async () => {
    const hostile = Object.defineProperty(new Response(""), "type", {
      get(): never {
        throw new Error(URL_SOURCE);
      },
    });
    const error = await failure(
      loadFeedData({ url: URL_SOURCE, fetch: () => Promise.resolve(hostile) }),
    );
    expect([error.code, error.message]).toEqual(["invalid-response", "The feed load failed."]);
    expectNoSecret(error);
  });

  test("a cache that throws the URL neither fails the load nor leaks it", async () => {
    const { data } = await loadFeedData({
      url: URL_SOURCE,
      fetch: stubFetch(() => xml("<rss><channel/></rss>")).fetch,
      cache: {
        get: () => Promise.reject(new Error(URL_SOURCE)),
        set: () => Promise.reject(new Error(URL_SOURCE)),
      },
    });
    expect(data.entries).toEqual([]);
  });
});
