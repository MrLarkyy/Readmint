import { describe, expect, test } from "vitest";
import { loadFeedData } from "../src/index.js";
import { failure, fixture, rss, stubFetch, xml } from "./stubFetch.js";

const URL_SOURCE = "https://unsorted.example/rss.xml";

const load = (limit?: number, body = fixture("unsorted.rss.xml")) =>
  loadFeedData({
    url: URL_SOURCE,
    fetch: stubFetch(() => xml(body)).fetch,
    ...(limit === undefined ? {} : { limit }),
  });

const titles = async (limit?: number) =>
  (await load(limit)).data.entries.map((entry) => entry.title);

describe("order", () => {
  test("newest first, equal dates in document order, undated last in document order", async () => {
    expect(await titles(50)).toEqual(["F", "C", "G", "A", "D", "B", "E"]);
    const { data } = await load(50);
    expect(data.entries.map((entry) => entry.published)).toEqual([
      "2026-10-08T10:00:00.000Z",
      "2026-10-07T10:00:00.000Z",
      "2026-10-06T10:00:00.000Z",
      "2026-10-05T10:00:00.000Z",
      "2026-10-05T10:00:00.000Z",
      null,
      null,
    ]);
  });

  test("the same bytes give the same data, twice", async () => {
    const first = await load(50);
    const second = await load(50);
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
  });
});

describe("limit", () => {
  test("defaults to 5, applied after sorting", async () => {
    expect(await titles()).toEqual(["F", "C", "G", "A", "D"]);
  });

  test("1 keeps the newest only", async () => {
    expect(await titles(1)).toEqual(["F"]);
  });

  test("50 entries are kept, the 51st dropped", async () => {
    const items = Array.from(
      { length: 60 },
      (_, index) => `<item><title>${String(index)}</title></item>`,
    ).join("");
    const { data } = await load(50, rss(items));
    expect(data.entries).toHaveLength(50);
    expect(data.entries.at(-1)?.title).toBe("49");
  });

  test.each([0, 51, 1.5, -1, Number.NaN])(
    "%d is invalid-option before any request",
    async (limit) => {
      const stub = stubFetch(() => xml(rss("")));
      const error = await failure(loadFeedData({ url: URL_SOURCE, limit, fetch: stub.fetch }));
      expect(error.code).toBe("invalid-option");
      expect(error.message).toBe("limit must be an integer from 1 to 50.");
      expect(stub.calls).toHaveLength(0);
    },
  );
});

describe("caps", () => {
  test("a title over 200 and a summary over 500 code points are cut with an ellipsis", async () => {
    const { data } = await load(
      undefined,
      rss(
        `<item><title>${"t".repeat(300)}</title><description>${"s".repeat(900)}</description></item>`,
      ),
    );
    const [entry] = data.entries;
    expect(Array.from(entry?.title ?? "")).toHaveLength(200);
    expect(entry?.title.endsWith("…")).toBe(true);
    expect(Array.from(entry?.summary ?? "")).toHaveLength(500);
  });

  test("markup in a description never survives as markup", async () => {
    const { data } = await load(
      undefined,
      rss(
        "<item><description>&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;ok</description></item>",
      ),
    );
    expect(data.entries[0]?.summary).toBe("ok");
  });
});
