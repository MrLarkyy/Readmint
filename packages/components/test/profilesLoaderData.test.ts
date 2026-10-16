import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { profileTemplates, type ProfileSection, type ProfileTemplate } from "../src/index.js";
import { loadProfile, renderProfile } from "./profileDesigns.js";

// What the data-github loader returns for the recorded fixture user: the profile templates must
// show it, not the text they show where `pinned`, `pushes` or `status` are missing.
const loaded: unknown = JSON.parse(
  readFileSync(
    new URL("../../data-github/test/fixtures/expected-github-data.json", import.meta.url),
    "utf8",
  ),
);

const fallbackText: Readonly<Record<ProfileTemplate, Partial<Record<ProfileSection, string>>>> = {
  "year-ring": {
    header: "No recent push yet.",
    recent: "No recent pushes yet.",
    "repo-1": "No repository in slot 1.",
  },
  horizon: {
    ticker: "No commits to show yet.",
    "repo-1": "No repository in slot 1.",
  },
  pinscreen: {
    header: "no pushes yet",
    log: "no commits yet",
    "repo-1": "no repository in this slot yet",
  },
};

const cases = (Object.keys(fallbackText) as ProfileTemplate[]).flatMap((template) =>
  (Object.keys(fallbackText[template]) as ProfileSection[]).map(
    (section) => [template, section, fallbackText[template][section] ?? ""] as const,
  ),
);

describe("the profile templates on the loader's data object", () => {
  test.each(cases)(
    "%s %s shows the loaded data, not its fallback text",
    (template, section, text) => {
      expect(profileTemplates[template]).toContain(section);
      const svg = renderProfile({
        template,
        design: loadProfile(template, section),
        data: { github: loaded },
      });
      expect(svg).toMatch(/^<svg /);
      expect(svg).not.toContain(text);
    },
  );

  test("year-ring repo-1 draws the 52 weekly commits of the first pinned repository", () => {
    const withWeeks = renderProfile({
      template: "year-ring",
      design: loadProfile("year-ring", "repo-1"),
      data: { github: loaded },
    });
    const withoutWeeks = renderProfile({
      template: "year-ring",
      design: loadProfile("year-ring", "repo-1"),
      data: {
        github: {
          ...(loaded as Record<string, unknown>),
          pinned: [],
          repositories: [],
        },
      },
    });
    expect(withWeeks).not.toBe(withoutWeeks);
  });
});
