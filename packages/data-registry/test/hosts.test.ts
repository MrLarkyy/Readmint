import { describe, expect, test } from "vitest";
import { loadRegistryData, REGISTRY_HOSTS } from "../src/index.js";
import { registryApis, stubFetch } from "./stubFetch.js";

describe("hosts", () => {
  test("every request is https, to a registry host, with no credential header", async () => {
    const stub = stubFetch(registryApis);
    await loadRegistryData({
      npm: ["react", "@types/node", "nosuchpackage-readmint"],
      maven: ["junit:junit", "org.jetbrains.kotlin:kotlin-stdlib"],
      fetch: stub.fetch,
    });
    expect(stub.calls.length).toBeGreaterThan(5);
    for (const call of stub.calls) {
      const url = new URL(call.url);
      expect(url.protocol).toBe("https:");
      expect(REGISTRY_HOSTS).toContain(url.hostname);
      expect(url.username + url.password + url.hash).toBe("");
      expect(call.init.redirect).toBe("manual");
      expect(call.init.credentials).toBe("omit");
      expect(call.init.method).toBe("GET");
      const names = (call.init.headers as [string, string][]).map(([name]) => name.toLowerCase());
      expect(names.sort()).toEqual(["accept", "user-agent"]);
    }
  });

  test("the hosts are exactly the npm registry, the npm downloads API and Maven Central repository", () => {
    expect([...REGISTRY_HOSTS]).toEqual(["registry.npmjs.org", "api.npmjs.org", "repo1.maven.org"]);
    expect(Object.isFrozen(REGISTRY_HOSTS)).toBe(true);
  });

  test("a scoped name stays inside its path", async () => {
    const stub = stubFetch(registryApis);
    await loadRegistryData({ npm: ["@types/node"], fetch: stub.fetch });
    expect(stub.calls.map((call) => call.url)).toEqual([
      "https://registry.npmjs.org/@types/node/latest",
      "https://api.npmjs.org/downloads/point/last-week/@types/node",
    ]);
  });
});
