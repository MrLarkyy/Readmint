import { describe, expect, test } from "vitest";
import type { GitHubRepository } from "../src/GitHubData.js";
import { languageRepositories } from "../src/languageRepositories.js";
import { languagesByRepo } from "../src/languagesByRepo.js";

function repository(name: string, languages: [string, number, string?][]): GitHubRepository {
  return {
    name,
    nameWithOwner: `owner/${name}`,
    description: null,
    url: `https://github.com/owner/${name}`,
    homepageUrl: null,
    stars: 0,
    forks: 0,
    isFork: false,
    isArchived: false,
    createdAt: "2020-01-01T00:00:00Z",
    pushedAt: null,
    primaryLanguage: null,
    languages: languages.map(([language, bytes, color]) => ({
      name: language,
      color: color ?? null,
      bytes,
    })),
  };
}

// One repository holds 3.29 MB of TypeScript; ten small ones are Kotlin with a little Java.
const dominant = [
  repository("big", [["TypeScript", 3_294_657, "#3178c6"]]),
  ...Array.from({ length: 10 }, (_, index) =>
    repository(`small-${String(index)}`, [
      ["Kotlin", 300, "#A97BFF"],
      ["Java", 100, "#b07219"],
    ]),
  ),
];

describe("languagesByRepo", () => {
  test("a dominant repository counts as one of eleven", () => {
    const result = languagesByRepo(dominant);
    expect(result.map((entry) => entry.name)).toEqual(["Kotlin", "Java", "TypeScript"]);
    expect(result[0]).toMatchObject({ name: "Kotlin", color: "#A97BFF", repositories: 10 });
    expect(result[0]?.share).toBeCloseTo((10 * 0.75) / 11, 12);
    expect(result[1]?.share).toBeCloseTo((10 * 0.25) / 11, 12);
    expect(result[2]).toMatchObject({ name: "TypeScript", repositories: 1 });
    expect(result[2]?.share).toBeCloseTo(1 / 11, 12);
    expect(result.reduce((total, entry) => total + entry.share, 0)).toBeCloseTo(1, 12);
  });

  test("a zero-byte repository counts in repositories only", () => {
    const result = languagesByRepo([
      repository("a", [["Go", 10]]),
      repository("empty", [["Go", 0]]),
    ]);
    expect(result).toEqual([{ name: "Go", color: null, share: 1, repositories: 2 }]);
  });

  test("no counted repository: every share is 0", () => {
    expect(languagesByRepo([repository("empty", [["Go", 0]])])[0]?.share).toBe(0);
    expect(languagesByRepo([])).toEqual([]);
  });

  test("equal shares are ordered by repositories, then name", () => {
    const result = languagesByRepo([
      repository("a", [
        ["B", 1],
        ["A", 1],
      ]),
    ]);
    expect(result.map((entry) => entry.name)).toEqual(["A", "B"]);
  });

  test("a language named __proto__ is an ordinary entry", () => {
    const only = [repository("a", [["__proto__", 5]])];
    expect(languagesByRepo(only)).toEqual([
      { name: "__proto__", color: null, share: 1, repositories: 1 },
    ]);
    expect(languageRepositories(only)).toEqual([
      { name: "__proto__", color: null, repositories: 1 },
    ]);
  });

  test("the first colour found is kept", () => {
    const result = languagesByRepo([
      repository("a", [["Go", 1]]),
      repository("b", [["Go", 1, "#00ADD8"]]),
    ]);
    expect(result[0]?.color).toBe("#00ADD8");
  });
});

describe("languageRepositories", () => {
  test("counts repositories, most first, then by name", () => {
    expect(languageRepositories(dominant)).toEqual([
      { name: "Java", color: "#b07219", repositories: 10 },
      { name: "Kotlin", color: "#A97BFF", repositories: 10 },
      { name: "TypeScript", color: "#3178c6", repositories: 1 },
    ]);
  });
});
