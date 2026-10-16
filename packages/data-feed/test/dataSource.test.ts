import { checkDataSource, type DataObject, type DataSourceLoadOptions } from "@readmint/data";
import { describe, expect, expectTypeOf, test } from "vitest";
import { feedDataSource, type FeedData, type FeedSourceOptions } from "../src/index.js";
import { failure, rss, stubFetch, xml } from "./stubFetch.js";

const URL_SOURCE = "https://blog.example/feed.xml";

describe("feedDataSource", () => {
  test("is a valid, frozen descriptor with the feed namespace", () => {
    expect(checkDataSource(feedDataSource)).toBe(feedDataSource);
    expect(Object.isFrozen(feedDataSource)).toBe(true);
    expect([feedDataSource.namespace, feedDataSource.dataVersion]).toEqual(["feed", 0]);
  });

  test("errors carry the default namespace, or the one given", async () => {
    const stub = stubFetch(() => new Response("", { status: 404 }));
    const plain = await failure(feedDataSource.load({ url: URL_SOURCE, fetch: stub.fetch }));
    expect([plain.source, plain.code]).toEqual(["feed", "not-found"]);
    const named = await failure(
      feedDataSource.load({ url: URL_SOURCE, namespace: "blog", fetch: stub.fetch }),
    );
    expect(named.source).toBe("blog");
  });

  test("a custom namespace loads the same data object", async () => {
    const body = rss("<item><title>a</title></item>");
    const plain = await feedDataSource.load({
      url: URL_SOURCE,
      fetch: stubFetch(() => xml(body)).fetch,
    });
    const named = await feedDataSource.load({
      url: URL_SOURCE,
      namespace: "blog",
      fetch: stubFetch(() => xml(body)).fetch,
    });
    expect(named.data).toEqual(plain.data);
  });

  test.each(["", "Blog", "a-b", "1a", "true", "x".repeat(33)])(
    "namespace %j is invalid-option and nothing is fetched",
    async (namespace) => {
      const stub = stubFetch(() => xml(rss("")));
      const error = await failure(
        feedDataSource.load({ url: URL_SOURCE, namespace, fetch: stub.fetch }),
      );
      expect(error.code).toBe("invalid-option");
      expect(stub.calls).toHaveLength(0);
    },
  );

  test("fits the shared contract types", () => {
    expectTypeOf<FeedData>().toExtend<DataObject>();
    expectTypeOf<FeedSourceOptions>().toExtend<DataSourceLoadOptions>();
  });
});
