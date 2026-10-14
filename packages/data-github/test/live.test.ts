import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { expect, test } from "vitest";
import { GITHUB_DATA_VERSION, loadGitHubData } from "../src/index.js";
import { keyPaths } from "./keyPaths.js";

// The one live run of the verification. It needs the user's token in READMINT_GITHUB_TOKEN and
// is skipped (no network) without it. It prints and writes nothing from the response.
const token = process.env.READMINT_GITHUB_TOKEN;

const documented = new Set(
  keyPaths(
    JSON.parse(
      readFileSync(new URL("./fixtures/expected-github-data.json", import.meta.url), "utf8"),
    ),
  ),
);

test.skipIf(token === undefined || token === "")(
  "loads the token owner's data from GitHub without exposing the token",
  async () => {
    const secret = token ?? "";
    let outcome: unknown;
    try {
      outcome = await loadGitHubData({ token: secret, maxRepositories: 10 });
    } catch (error) {
      const text = [String(error), inspect(error, { depth: null, showHidden: true })].join("\n");
      expect(text.includes(secret)).toBe(false);
      throw error;
    }
    const { data, meta } = outcome as Awaited<ReturnType<typeof loadGitHubData>>;
    expect(data.version).toBe(GITHUB_DATA_VERSION);
    expect(JSON.stringify({ data, meta }).includes(secret)).toBe(false);
    expect(inspect(outcome, { depth: null }).includes(secret)).toBe(false);
    const unknownPaths = keyPaths(data).filter((path) => !documented.has(path));
    expect(unknownPaths).toEqual([]);
    expect(data.contributions.days.length).toBeGreaterThan(300);
    expect(meta.fromCache).toBe(false);
  },
  60_000,
);
