import { describe, expect, test } from "vitest";
import { loadJsonData, type JsonFileReader } from "../src/index.js";
import { failure, json, stubFetch } from "./stubFetch.js";

const encoder = new TextEncoder();

function readerOf(files: Record<string, string>): JsonFileReader {
  return (relative) => {
    const text = files[relative];
    if (text === undefined) return Promise.reject(new Error("no such file"));
    return Promise.resolve(encoder.encode(text));
  };
}

describe("loadJsonData from a file", () => {
  test.each([
    ["object", '{"stars":42,"name":"readmint"}', { stars: 42, name: "readmint" }],
    ["array", "[1,2,3]", [1, 2, 3]],
    ["scalar", "42", 42],
    ["string", '"text"', "text"],
    ["null", "null", null],
  ])("a %s document becomes { version: 0, document }", async (_kind, text, document) => {
    const result = await loadJsonData({
      source: "data/doc.json",
      readFile: readerOf({ "data/doc.json": text }),
    });
    expect(result.data).toEqual({ version: 0, document });
    expect(result.meta).toEqual({ requests: 0, fromCache: false });
  });

  test("a document with its own version keeps it under document", async () => {
    const { data } = await loadJsonData({
      source: "package.json",
      readFile: readerOf({ "package.json": '{"version":"1.2.3","name":"x"}' }),
    });
    expect(data.version).toBe(0);
    expect(data.document).toEqual({ version: "1.2.3", name: "x" });
  });

  test("keeps the document key order", async () => {
    const { data } = await loadJsonData({
      source: "a.json",
      readFile: readerOf({ "a.json": '{"zeta":1,"alpha":{"y":1,"b":2},"mid":3}' }),
    });
    expect(JSON.stringify(data.document)).toBe('{"zeta":1,"alpha":{"y":1,"b":2},"mid":3}');
  });

  test("two loads of the same bytes are equal and stringify the same", async () => {
    const text = '{"b":[1,{"c":"ž"}],"a":true}';
    const load = () => loadJsonData({ source: "a.json", readFile: readerOf({ "a.json": text }) });
    const [first, second] = await Promise.all([load(), load()]);
    expect(second.data).toEqual(first.data);
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
  });

  test("a file source without a host reader is invalid-option", async () => {
    const error = await failure(loadJsonData({ source: "a.json" }));
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain("file reader");
  });

  test("a reader's foreign error becomes a fixed message", async () => {
    const reader: JsonFileReader = () => Promise.reject(new Error("EACCES C:\\secret\\root"));
    const error = await failure(loadJsonData({ source: "a.json", readFile: reader }));
    expect(error.code).toBe("invalid-option");
    expect(error.message).not.toContain("secret");
  });

  test("a reader returning more than maxBytes is too-large", async () => {
    const reader: JsonFileReader = () => Promise.resolve(new Uint8Array(11).fill(0x20));
    const error = await failure(loadJsonData({ source: "a.json", readFile: reader, maxBytes: 10 }));
    expect(error.code).toBe("too-large");
  });

  test("headers with a file source are invalid-option", async () => {
    const error = await failure(
      loadJsonData({
        source: "a.json",
        headers: { authorization: "TOKEN" },
        env: { TOKEN: "x" },
        readFile: readerOf({ "a.json": "{}" }),
      }),
    );
    expect(error.code).toBe("invalid-option");
  });
});

describe("loadJsonData from a URL", () => {
  test("an object document becomes { version: 0, document } in one request", async () => {
    const stub = stubFetch(() => json('{"count":7}'));
    const result = await loadJsonData({ source: "https://api.example/x", fetch: stub.fetch });
    expect(result.data).toEqual({ version: 0, document: { count: 7 } });
    expect(result.meta).toEqual({ requests: 1, fromCache: false });
    expect(stub.calls[0]?.url).toBe("https://api.example/x");
    expect(stub.calls[0]?.init).toMatchObject({
      method: "GET",
      redirect: "manual",
      credentials: "omit",
    });
  });

  test("the same document from a file and a URL is the same data", async () => {
    const text = '{"a":[1,2],"b":{"c":null}}';
    const fromFile = await loadJsonData({
      source: "a.json",
      readFile: readerOf({ "a.json": text }),
    });
    const fromUrl = await loadJsonData({
      source: "https://api.example/a.json",
      fetch: stubFetch(() => json(text)).fetch,
    });
    expect(JSON.stringify(fromUrl.data)).toBe(JSON.stringify(fromFile.data));
  });

  test.each([
    ["ftp://host/a.json"],
    ["file:///etc/passwd"],
    ["HTTP://host/a.json"],
    ["https:host/a.json"],
    ["javascript:alert(1)"],
  ])("source %j is invalid-option and nothing is fetched", async (source) => {
    const stub = stubFetch(() => json("{}"));
    const error = await failure(loadJsonData({ source, fetch: stub.fetch }));
    expect(error.code).toBe("invalid-option");
    expect(stub.calls).toHaveLength(0);
  });

  test.each([
    ["maxBytes", 0],
    ["maxBytes", 8 * 1024 * 1024 + 1],
    ["timeoutMs", 999],
    ["timeoutMs", 60_001],
    ["cacheTtlSeconds", 0],
    ["timeoutMs", 1.5],
  ])("%s %d is invalid-option", async (name, value) => {
    const stub = stubFetch(() => json("{}"));
    const error = await failure(
      loadJsonData({ source: "https://api.example/x", fetch: stub.fetch, [name]: value }),
    );
    expect(error.code).toBe("invalid-option");
    expect(error.message).toContain(name);
    expect(stub.calls).toHaveLength(0);
  });
});
