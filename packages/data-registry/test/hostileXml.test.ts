import { describe, expect, test } from "vitest";
import { loadRegistryData } from "../src/index.js";
import { failure, metadata, stubFetch, xml } from "./stubFetch.js";

async function refused(body: string, maxBytes?: number) {
  const stub = stubFetch(() => xml(body));
  const started = performance.now();
  const error = await failure(
    loadRegistryData({
      maven: ["a:b"],
      fetch: stub.fetch,
      ...(maxBytes === undefined ? {} : { maxBytes }),
    }),
  );
  return { error, requests: stub.calls.length, elapsed: performance.now() - started };
}

const GOOD = metadata("a", "b", "1.0", "20250101000000");

describe("a hostile maven-metadata.xml", () => {
  test.each([
    [
      "billion laughs",
      `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><metadata><groupId>&lol2;</groupId></metadata>`,
    ],
    [
      "an external entity",
      '<!DOCTYPE metadata [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><metadata><groupId>&xxe;</groupId></metadata>',
    ],
    ["a CDATA section", "<metadata><groupId><![CDATA[a]]></groupId></metadata>"],
    ["a DOCTYPE after the root", `${GOOD}<!DOCTYPE metadata>`],
  ])("%s is refused after one request, at once", async (_name, body) => {
    const { error, requests, elapsed } = await refused(body);
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe(
      "The Maven Central answer has a DOCTYPE or another markup declaration; DTDs and entity declarations are refused.",
    );
    expect(requests).toBe(1);
    expect(elapsed).toBeLessThan(5000);
  });

  test.each([
    ["an entity reference in a read field", "<metadata><groupId>a&amp;b</groupId></metadata>"],
    ["an unclosed tag", "<metadata><groupId>a</metadata>"],
    ["a closing tag that was never opened", "<metadata></x></metadata>"],
    ["a second root", `${GOOD}<metadata/>`],
    ["a root that is not metadata", "<other><groupId>a</groupId></other>"],
    ["no root", "just text"],
    ["an unterminated tag", "<metadata><groupId"],
    ["an unterminated comment", "<metadata><!-- x"],
    ["a field holding an element", "<metadata><groupId><x/></groupId></metadata>"],
    [
      "a field longer than 256 characters",
      `<metadata><groupId>${"a".repeat(300)}</groupId></metadata>`,
    ],
    ["nesting beyond 16 levels", `${"<x>".repeat(40)}${"</x>".repeat(40)}`],
    ["a comment in a read field", GOOD.replace("<release>1.0", "<release>1.0<!--x-->")],
    ["a processing instruction in a read field", GOOD.replace("<release>1.0", "<release>1.0<?x?>")],
    ["an element name longer than 128 characters", `<metadata><${"a".repeat(129)}/></metadata>`],
    ["a stray character after a tag name", "<metadata$x></metadata>"],
    ["an end tag with attributes", '<metadata></metadata a="b">'],
    ["a self-closing end tag", "<metadata></metadata/>"],
  ])("%s is invalid-response with fixed text", async (_name, body) => {
    const { error } = await refused(body);
    expect(error.code).toBe("invalid-response");
    expect(error.message).toBe("The Maven Central answer is not valid maven-metadata.xml.");
  });

  test("a huge body is too-large before it is parsed", async () => {
    const { error } = await refused(`<metadata>${"<x/>".repeat(400_000)}</metadata>`);
    expect(error.code).toBe("too-large");
  });

  test.each([
    ["one long tag with a stray <", `<metadata><${"a".repeat(900_000)}<b></metadata>`],
    ["one long attribute run with a stray <", `<metadata><a ${"x".repeat(900_000)}<b></metadata>`],
    ["a megabyte of <", "<".repeat(1_000_000)],
    ["a megabyte of <a", "<a".repeat(500_000)],
    ["a megabyte of unclosed tags", `<metadata>${"<a ".repeat(330_000)}`],
    ["a megabyte of unterminated comments", "<!--".repeat(250_000)],
    ["a megabyte of unterminated processing instructions", "<?".repeat(500_000)],
  ])("%s inside the size cap is invalid-response in linear time", async (_name, body) => {
    const { error, elapsed } = await refused(body);
    expect(error.code).toBe("invalid-response");
    expect(elapsed).toBeLessThan(2000);
  });

  test("many tags under a long element name are parsed in linear time", async () => {
    const body = `<metadata><${"n".repeat(128)}>${"<x/>".repeat(190_000)}</${"n".repeat(128)}></metadata>`;
    const started = performance.now();
    const { data } = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(body)).fetch,
    });
    expect(data.maven).toEqual([null]);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  test("a prefixed element and attributes on the root are read past", async () => {
    const body = GOOD.replace(
      "<metadata>",
      '<metadata xmlns="http://maven.apache.org/METADATA/1.1.0" modelVersion="1.1.0">',
    ).replace("<latest>", "<x:extra a='/'>1</x:extra><latest>");
    const { data } = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(body)).fetch,
    });
    expect(data.maven[0]?.latestVersion).toBe("1.0");
  });

  test("a long run of tags inside the cap is parsed in linear time", async () => {
    const body = `<metadata><groupId>a</groupId><artifactId>b</artifactId><versioning>${"<x/>".repeat(100_000)}<release>1</release><lastUpdated>20250101000000</lastUpdated></versioning></metadata>`;
    const started = performance.now();
    const { data } = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(body)).fetch,
    });
    expect(data.maven[0]?.latestVersion).toBe("1");
    expect(performance.now() - started).toBeLessThan(5000);
  });

  test("a group or artifact of another entry, or only in a nested element, is a miss", async () => {
    const nested =
      "<metadata><plugins><groupId>a</groupId><artifactId>b</artifactId></plugins></metadata>";
    const { data } = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(nested)).fetch,
    });
    expect(data.maven).toEqual([null]);
  });

  test("a prototype name never leaks into the data", async () => {
    const body = GOOD.replace("<latest>", "<__proto__>x</__proto__><latest>");
    const { data } = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(body)).fetch,
    });
    expect(Object.keys(data.maven[0] ?? {}).sort()).toEqual([
      "artifact",
      "group",
      "latestVersion",
      "updated",
    ]);
  });
});
