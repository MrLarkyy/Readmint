import { describe, expect, test } from "vitest";
import { buildGitHubData } from "../src/buildGitHubData.js";
import type { RepositoriesPageRecord } from "../src/GitHubRecords.js";
import { parseProfileResponse } from "../src/parseProfileResponse.js";
import { parseRepositoriesPage } from "../src/parseRepositoriesPage.js";
import { item } from "./fixtureBodies.js";
import { exchange } from "./replayFetch.js";

const data = (name: string): unknown => (exchange(name).body as { data: unknown }).data;
const profile = parseProfileResponse(data("profile"));
const pages = ["repositories-1", "repositories-2", "repositories-3"].map((name) =>
  parseRepositoriesPage(data(name), 2),
);

function reversedPages(): RepositoriesPageRecord[] {
  // The same repositories in another order and page split; the last page still ends the chain.
  const all = pages.flatMap((page) => page.repositories).reverse();
  return [
    { ...item(pages, 0), repositories: all.slice(0, 3) },
    { ...item(pages, 2), repositories: all.slice(3) },
  ];
}

function collectUndefined(value: unknown, path: string, found: string[]): void {
  if (value === undefined) found.push(path);
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value))
    collectUndefined(child, `${path}.${key}`, found);
}

describe("buildGitHubData", () => {
  test("the response order does not change a byte of the result", () => {
    const reference = JSON.stringify(buildGitHubData(profile, pages, 300));
    expect(JSON.stringify(buildGitHubData(profile, reversedPages(), 300))).toBe(reference);
    const shuffledLanguages = pages.map((page) => ({
      ...page,
      repositories: page.repositories.map((repository) => ({
        ...repository,
        languages: [...repository.languages].reverse(),
      })),
    }));
    expect(JSON.stringify(buildGitHubData(profile, shuffledLanguages, 300))).toBe(reference);
  });

  test("equal stars and equal bytes are ordered by name in code units", () => {
    const result = buildGitHubData(profile, pages, 300);
    expect(result.repositories.map((repository) => repository.name)).toEqual([
      "readmint",
      "dotfiles",
      "forked-lib",
      "notes",
      "site",
    ]);
    const site = result.repositories.find((repository) => repository.name === "site");
    expect(site?.languages.map((language) => language.name)).toEqual([
      "HTML",
      "Fixture Lang",
      "TypeScript",
    ]);
  });

  test("forks count in repositories but not in stars, forks or languages", () => {
    const result = buildGitHubData(profile, pages, 300);
    expect(result.repositories.some((repository) => repository.isFork)).toBe(true);
    expect(result.counts).toEqual({ repositories: 5, stars: 166, forks: 11 });
    expect(result.languages.map((language) => language.name)).not.toContain("Rust");
    const shares = result.languages.reduce((total, language) => total + language.share, 0);
    expect(shares).toBeCloseTo(1, 12);
  });

  test("a repository repeated across pages is kept once", () => {
    const first = item(pages, 0);
    const repeated = [first, { ...item(pages, 1), repositories: [...first.repositories] }];
    const result = buildGitHubData(profile, repeated, 300);
    expect(result.repositories.map((repository) => repository.name)).toEqual([
      "readmint",
      "dotfiles",
    ]);
  });

  test("the object is plain JSON without undefined values", () => {
    const result = buildGitHubData(profile, pages, 300);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(structuredClone(result)).toEqual(result);
    const found: string[] = [];
    collectUndefined(result, "github", found);
    expect(found).toEqual([]);
  });

  test("days carry their week column and weekday", () => {
    const { contributions } = buildGitHubData(profile, pages, 300);
    expect(contributions.days).toHaveLength(371);
    expect(contributions.days[0]).toMatchObject({ date: "2025-10-08", weekday: 3, week: 0 });
    expect(contributions.days[4]).toMatchObject({ date: "2025-10-12", weekday: 0, week: 1 });
    expect(contributions.days.at(-1)).toMatchObject({ date: "2026-10-13", weekday: 2, week: 53 });
    expect(contributions.weeks).toBe(54);
  });
});
