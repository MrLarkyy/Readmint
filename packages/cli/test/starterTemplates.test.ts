import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { renderSvg } from "@readmint/renderer";
import { loadDesignAssets, loadDesignFile } from "../src/index.js";

// The templates of @readmint/components are read from disk as a user does, without the package depending on it.
const templates = join(import.meta.dirname, "..", "..", "components", "templates");

const days = [0, 1, 2].map((week) => ({
  date: `2026-01-0${String(week + 1)}`,
  count: week,
  level: week,
  weekday: week,
  week: 0,
}));
const streak = { length: 2, start: "2026-01-02", end: "2026-01-03" };
const data = {
  github: {
    login: "readmint-sample",
    name: "Sample",
    bio: null,
    followers: 3,
    counts: { repositories: 2, stars: 5, forks: 1 },
    languages: [{ name: "TypeScript", color: null, bytes: 10, share: 1 }],
    contributions: {
      total: 3,
      commits: 3,
      pullRequests: 0,
      issues: 0,
      reviews: 0,
      weeks: 1,
      days,
      streaks: { current: streak, longest: streak },
    },
  },
};

const starters = readdirSync(templates).filter(
  (file) => file.endsWith(".design.json") && !file.startsWith("calendar-"),
);

test("the folder holds the starter templates", () => {
  expect(starters).toHaveLength(5);
});

test.each(starters)("%s renders from disk with its relative fonts resolved", async (file) => {
  const design = await loadDesignFile(file, { cwd: templates });
  const assets = await loadDesignAssets(design);
  expect(Object.keys(assets.fonts ?? {}).sort()).toEqual(
    Object.keys(design.design.assets?.fonts ?? {}).sort(),
  );
  const result = renderSvg(design.design, { data, assets });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  expect(result.warnings).toEqual([]);
  expect(result.svg).toContain("@font-face");
});
