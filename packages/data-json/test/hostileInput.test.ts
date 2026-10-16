import { afterEach, describe, expect, test, vi } from "vitest";
import { JsonLimits, loadJsonData, type JsonFileReader } from "../src/index.js";
import { failure } from "./stubFetch.js";

const bytesReader =
  (bytes: Uint8Array): JsonFileReader =>
  () =>
    Promise.resolve(bytes);
const textReader = (text: string) => bytesReader(new TextEncoder().encode(text));
const load = (reader: JsonFileReader, maxBytes?: number) =>
  loadJsonData({
    source: "doc.json",
    readFile: reader,
    ...(maxBytes === undefined ? {} : { maxBytes }),
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nesting and size", () => {
  test("64 levels load; 65 are too-large before JSON.parse runs", async () => {
    const nested = (depth: number) => "[".repeat(depth) + "]".repeat(depth);
    await expect(load(textReader(nested(64)))).resolves.toBeDefined();
    const parse = vi.spyOn(JSON, "parse");
    const error = await failure(load(textReader(nested(65))));
    expect(error.code).toBe("too-large");
    expect(parse).not.toHaveBeenCalled();
  });

  test("100000 levels fail without a stack overflow", async () => {
    const error = await failure(
      load(textReader("[".repeat(100_000) + "]".repeat(100_000)), 8 << 20),
    );
    expect(error.code).toBe("too-large");
  });

  test("brackets inside strings do not count as nesting", async () => {
    const text = JSON.stringify({ text: "[".repeat(200) + '\\"{' });
    const { data } = await load(textReader(text));
    expect(data.document).toEqual(JSON.parse(text));
  });

  test("more than 200000 values are too-large", async () => {
    const text = `[${new Array(1_000_000).fill("0").join(",")}]`;
    const error = await failure(load(textReader(text), JsonLimits.maxMaxBytes));
    expect(error.code).toBe("too-large");
    expect(error.message).toContain("200000");
  });

  test("a file of 8 MiB + 1 is too-large", async () => {
    const error = await failure(
      load(
        bytesReader(new Uint8Array(JsonLimits.maxMaxBytes + 1).fill(0x20)),
        JsonLimits.maxMaxBytes,
      ),
    );
    expect(error.code).toBe("too-large");
  });

  test("a number beyond a double is invalid-response", async () => {
    const error = await failure(load(textReader('{"n":1e400}')));
    expect(error.code).toBe("invalid-response");
  });
});

describe("prototype pollution", () => {
  test("a __proto__ key stays an own key and pollutes nothing", async () => {
    const { data } = await load(
      textReader('{"__proto__":{"polluted":true},"a":{"__proto__":[1]}}'),
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
    const document = data.document as Record<string, unknown>;
    expect(Object.hasOwn(document, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(document)).toBe(Object.prototype);
    expect(JSON.stringify(document)).toBe('{"__proto__":{"polluted":true},"a":{"__proto__":[1]}}');
  });
});

describe("encoding and syntax", () => {
  test("invalid UTF-8 is invalid-response", async () => {
    const error = await failure(load(bytesReader(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]))));
    expect(error.code).toBe("invalid-response");
    expect(error.message).toContain("UTF-8");
  });

  test("trailing garbage is invalid-response without quoting the body", async () => {
    const error = await failure(load(textReader('{"a":1} SECRET-BODY')));
    expect(error.code).toBe("invalid-response");
    expect(error.message).not.toContain("SECRET");
    expect(error.message).not.toContain("position");
  });

  test("an empty file is invalid-response", async () => {
    expect((await failure(load(textReader("")))).code).toBe("invalid-response");
  });

  test("one byte order mark is accepted", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('{"a":1}')]);
    expect((await load(bytesReader(bytes))).data.document).toEqual({ a: 1 });
  });
});
