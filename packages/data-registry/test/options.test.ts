import { describe, expect, test } from "vitest";
import {
  isMavenCoordinate,
  isNpmPackageName,
  loadRegistryData,
  type RegistrySourceOptions,
} from "../src/index.js";
import { failure, registryApis, stubFetch } from "./stubFetch.js";

async function refused(options: RegistrySourceOptions): Promise<string> {
  const stub = stubFetch(registryApis);
  const error = await failure(loadRegistryData({ ...options, fetch: stub.fetch }));
  expect(error.code).toBe("invalid-option");
  expect(stub.calls).toHaveLength(0);
  return error.message;
}

describe("names", () => {
  test.each([
    "react",
    "@types/node",
    "a",
    "left-pad",
    "lodash.merge",
    "~tilde",
    "x".repeat(214),
    "@a/b",
  ])("%s is an npm package name", (name) => {
    expect(isNpmPackageName(name)).toBe(true);
  });

  test.each([
    "",
    "React",
    ".hidden",
    "_private",
    "..",
    "a/b",
    "@scope",
    "@scope/",
    "@Scope/name",
    "@scope/name/extra",
    "name?x=1",
    "name#frag",
    "na me",
    "x".repeat(215),
    "node_modules",
    "favicon.ico",
    "@a/node_modules",
    "naïve",
  ])("%j is not", (name) => {
    expect(isNpmPackageName(name)).toBe(false);
  });

  test.each([
    "org.jetbrains.kotlin:kotlin-stdlib",
    "junit:junit",
    "a:b",
    "a_b.c-d:e",
    "a:b..c",
    "a:-",
  ])("%s is a Maven coordinate", (value) => {
    expect(isMavenCoordinate(value)).toBe(true);
  });

  test.each([
    "junit",
    "a:b:c",
    "a: b",
    ":b",
    "a:",
    "a b:c",
    "a:b/c",
    `${"x".repeat(129)}:b`,
    3,
    "a:.",
    "a:..",
    "a:...",
    ".:b",
    "..:b",
    "a..b:c",
    ".a:b",
    "a.:b",
    "a.b.:c",
    "a.b..:c",
  ])("%j is not", (value) => {
    expect(isMavenCoordinate(value)).toBe(false);
  });
});

describe("options", () => {
  test("an invalid entry is named by option and index, not echoed", async () => {
    const message = await refused({ npm: ["react", "ok", "Bad<script>"] });
    expect(message).toBe("npm[2] is not a valid npm package name.");
    expect(await refused({ maven: ["a:b", "secret-looking value"] })).toBe(
      "maven[1] is not a Maven coordinate (group:artifact).",
    );
  });

  test("needs an entry, at most 20 each, no duplicate", async () => {
    expect(await refused({})).toBe("npm or maven needs at least one entry.");
    expect(await refused({ npm: [], maven: [] })).toBe("npm or maven needs at least one entry.");
    const many = Array.from({ length: 21 }, (_, index) => `pkg${String(index)}`);
    expect(await refused({ npm: many })).toBe("npm takes at most 20 entries.");
    expect(await refused({ npm: ["react", "react"] })).toBe("npm[1] repeats an earlier entry.");
    expect(await refused({ maven: ["a:b", "a:b"] })).toBe("maven[1] repeats an earlier entry.");
  });

  test("a list that is not an array of strings is refused", async () => {
    expect(await refused({ npm: "react" as unknown as string[] })).toBe(
      "npm must be an array of strings.",
    );
    expect(await refused({ npm: [3 as unknown as string] })).toBe(
      "npm[0] is not a valid npm package name.",
    );
  });

  test("namespace and numeric limits are checked", async () => {
    expect(await refused({ npm: ["react"], namespace: "Bad-Name" })).toContain("namespace");
    expect(await refused({ npm: ["react"], maxBytes: 0 })).toContain("maxBytes");
    expect(await refused({ npm: ["react"], maxBytes: 5 * 1024 * 1024 })).toContain("maxBytes");
    expect(await refused({ npm: ["react"], timeoutMs: 10 })).toContain("timeoutMs");
    expect(await refused({ npm: ["react"], cacheTtlSeconds: 0 })).toContain("cacheTtlSeconds");
  });
});
