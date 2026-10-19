import { describe, expect, test } from "vitest";
import { loadRegistryData } from "../src/index.js";
import { fixture, json, metadata, registryApis, stubFetch, xml } from "./stubFetch.js";

const EXPECTED: unknown = JSON.parse(fixture("expected-registry-data.json"));
const ALL = {
  npm: ["react", "@types/node"],
  maven: ["org.jetbrains.kotlin:kotlin-stdlib", "junit:junit"],
};

describe("loadRegistryData", () => {
  test("binds the fixture answers in the order asked for", async () => {
    const stub = stubFetch(registryApis);
    const { data, meta } = await loadRegistryData({ ...ALL, fetch: stub.fetch });
    expect(data).toEqual(EXPECTED);
    expect(meta).toEqual({ requests: 6, fromCache: false, missing: [] });
    expect(Object.isFrozen(data.npm)).toBe(true);
    expect(stub.calls.map((call) => new URL(call.url).hostname)).toEqual([
      "registry.npmjs.org",
      "api.npmjs.org",
      "registry.npmjs.org",
      "api.npmjs.org",
      "repo1.maven.org",
      "repo1.maven.org",
    ]);
  });

  test("keeps the order given, not the order of the answers", async () => {
    const { data } = await loadRegistryData({
      npm: ["@types/node", "react"],
      fetch: stubFetch(registryApis).fetch,
    });
    expect(data.npm.map((entry) => entry?.name)).toEqual(["@types/node", "react"]);
    expect(data.maven).toEqual([]);
  });

  test("a package npm does not know is null and named, the rest is kept", async () => {
    const { data, meta } = await loadRegistryData({
      npm: ["react", "nosuchpackage-readmint"],
      maven: ["org.example:gone", "junit:junit"],
      fetch: stubFetch(registryApis).fetch,
    });
    expect(data.npm[0]?.name).toBe("react");
    expect(data.npm[1]).toBeNull();
    expect(data.maven[0]).toBeNull();
    expect(data.maven[1]?.latestVersion).toBe("4.13.2");
    expect(meta.missing).toEqual(["npm:nosuchpackage-readmint", "maven:org.example:gone"]);
  });

  test("a 404 from the downloads API keeps the package with null downloads", async () => {
    const stub = stubFetch((url) =>
      url.startsWith("https://api.npmjs.org/") ? json('{"error":"x"}', 404) : registryApis(url),
    );
    const { data, meta } = await loadRegistryData({ npm: ["react"], fetch: stub.fetch });
    expect(data.npm).toEqual([{ name: "react", version: "19.1.0", weeklyDownloads: null }]);
    expect(meta.missing).toEqual([]);
  });

  test("a Maven document of another group or artifact is a miss", async () => {
    const stub = stubFetch(() =>
      xml(metadata("org.other", "kotlin-stdlib", "1", "20250101000000")),
    );
    const { data } = await loadRegistryData({
      maven: ["org.jetbrains.kotlin:kotlin-stdlib"],
      fetch: stub.fetch,
    });
    expect(data.maven).toEqual([null]);
  });

  test("the same answers give the same JSON twice", async () => {
    const run = () => loadRegistryData({ ...ALL, fetch: stubFetch(registryApis).fetch });
    expect(JSON.stringify((await run()).data)).toBe(JSON.stringify((await run()).data));
  });

  test("the Maven request is the artifact's maven-metadata.xml, the group as a path, XML", async () => {
    const stub = stubFetch(registryApis);
    await loadRegistryData({ maven: ["org.jetbrains.kotlin:kotlin-stdlib"], fetch: stub.fetch });
    expect(stub.calls.map((call) => call.url)).toEqual([
      "https://repo1.maven.org/maven2/org/jetbrains/kotlin/kotlin-stdlib/maven-metadata.xml",
    ]);
    expect(stub.calls[0]?.init.headers).toContainEqual(["accept", "application/xml, text/xml"]);
  });

  test("release wins over latest, and latest is the fallback", async () => {
    const body = (versioning: string) =>
      `<metadata><groupId>a</groupId><artifactId>b</artifactId><versioning>${versioning}<lastUpdated>20260102030405</lastUpdated></versioning></metadata>`;
    const both = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(body("<latest>2.0-beta</latest><release>1.9</release>"))).fetch,
    });
    expect(both.data.maven[0]).toEqual({
      group: "a",
      artifact: "b",
      latestVersion: "1.9",
      updated: "2026-01-02",
    });
    const latest = await loadRegistryData({
      maven: ["a:b"],
      fetch: stubFetch(() => xml(body("<latest>2.0-beta</latest>"))).fetch,
    });
    expect(latest.data.maven[0]?.latestVersion).toBe("2.0-beta");
  });
});
