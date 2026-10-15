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
    expect(Array.isArray(meta.partial)).toBe(true);
    expect(data.pinned.length).toBeLessThanOrEqual(6);
    for (const repository of data.pinned) {
      const weeks = repository.weeklyCommits;
      expect(
        weeks === null ||
          (weeks.length === 52 && weeks.every((count) => Number.isInteger(count) && count >= 0)),
      ).toBe(true);
    }
    expect(data.pushes.length).toBeLessThanOrEqual(10);
    const last = Date.parse(`${data.contributions.to}T00:00:00Z`);
    const dayMs = 86_400_000;
    const times = data.pushes.map((push) => Date.parse(push.date));
    expect(times).toEqual([...times].sort((left, right) => right - left));
    for (const time of times) {
      expect(time).toBeGreaterThanOrEqual(last - 6 * dayMs);
      expect(time).toBeLessThan(last + dayMs);
    }
    if (data.status !== null) {
      expect(typeof (data.status.message ?? "")).toBe("string");
      expect(typeof (data.status.emoji ?? "")).toBe("string");
    }
  },
  60_000,
);
