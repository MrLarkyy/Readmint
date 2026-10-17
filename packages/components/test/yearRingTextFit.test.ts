import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSvg } from "@readmint/golden/node";
import { renderSvg } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import {
  loadExampleProfile,
  profileFontAssets,
  renderProfile,
  type ProfileTheme,
} from "./profileDesigns.js";
import { longTextProfileData, sampleProfileData } from "./sampleProfileData.js";

const themes: readonly ProfileTheme[] = ["light", "dark"];
const goldens = fileURLToPath(new URL("./golden/profiles-year-ring/", import.meta.url));

/** One drawn line: its glyph x positions, its baseline and its characters. */
interface DrawnLine {
  readonly xs: readonly number[];
  readonly y: string;
  readonly text: string;
}

/** A drawn text: its first glyph's x and its lines, in document order. */
interface DrawnText {
  readonly x: number;
  readonly lines: readonly DrawnLine[];
}

function texts(svg: string): DrawnText[] {
  return [...svg.matchAll(/<text\s[^>]*>([\s\S]*?)<\/text>/gu)].map((element) => {
    const lines = new Map<string, { xs: number[]; y: string; text: string }>();
    for (const span of (element[1] ?? "").matchAll(
      /<tspan[^>]* x="([^"]*)" y="([^"]*)"[^>]*>([^<]*)<\/tspan>/gu,
    )) {
      const y = span[2] ?? "";
      const line = lines.get(y) ?? { xs: [], y, text: "" };
      line.xs.push(...(span[1] ?? "").split(" ").map(Number));
      line.text += span[3] ?? "";
      lines.set(y, line);
    }
    const all = [...lines.values()];
    return { x: all[0]?.xs[0] ?? Number.NaN, lines: all };
  });
}

/** The single line of a one-line text. */
const only = (text: DrawnText | undefined): DrawnLine | undefined => text?.lines[0];

/** The advance of `…` in a font asset of the section at a size, as the renderer lays it out. */
function ellipsisAdvance(section: "recent" | "repo-1", font: string, fontSize: number): number {
  const design = loadExampleProfile("year-ring", section);
  const result = renderSvg(
    {
      version: 0,
      canvas: { width: 100, height: 100 },
      assets: { fonts: design.assets?.fonts ?? {} },
      layers: [{ type: "text", content: "…", font, fontSize }],
    },
    {
      assets: { fonts: profileFontAssets("year-ring", design) },
      layerBoxes: true,
    },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.layerBoxes?.[0]?.width ?? Number.NaN;
}

/** Where a line cut with `…` ends: its last glyph's start plus the ellipsis' advance. */
const end = (line: DrawnLine | undefined, advance: number) =>
  (line?.xs.at(-1) ?? Number.NaN) + advance;

function render(section: "recent" | "repo-1", theme: ProfileTheme, data = longTextProfileData()) {
  return renderProfile({
    template: "year-ring",
    design: loadExampleProfile("year-ring", section, theme),
    data,
  });
}

/** Every glyph position of a render, to compare the twins' geometry. */
const geometry = (svg: string) =>
  texts(svg).flatMap((text) => text.lines.map(({ xs, y }) => ({ xs, y })));

describe("year ring recent rows fit long names and messages (RM-123)", () => {
  for (const theme of themes) {
    test(`${theme}: repositories end with … inside 188, the message inside 636`, () => {
      const drawn = texts(render("recent", theme));
      const repositories = drawn.filter((text) => text.x === 100).map(only);
      const messages = drawn.filter((text) => text.x === 196).map(only);
      const bold = ellipsisAdvance("recent", "bold", 14);
      for (const repository of repositories.slice(0, 3)) {
        expect(repository?.text.endsWith("…"), repository?.text).toBe(true);
        expect(end(repository, bold)).toBeLessThanOrEqual(188);
      }
      expect(repositories[3]?.text).toBe("notebook-kit");
      const message = messages[0];
      expect(message?.text.endsWith("…")).toBe(true);
      expect(end(message, ellipsisAdvance("recent", "reg", 14))).toBeLessThanOrEqual(636);
    });
  }

  test("light and dark place every glyph alike", () => {
    expect(geometry(render("recent", "dark"))).toEqual(geometry(render("recent", "light")));
  });
});

describe("year ring repository card fits a long name and description (RM-123)", () => {
  for (const theme of themes) {
    test(`${theme}: the name ends with … inside 300, the description on 2 lines with … inside 400`, () => {
      const drawn = texts(render("repo-1", theme));
      const name = only(drawn.find((text) => text.x === 0 && text.lines[0]?.y === "30"));
      expect(name?.text.endsWith("…")).toBe(true);
      expect(end(name, ellipsisAdvance("repo-1", "med", 19))).toBeLessThanOrEqual(300);
      const description = drawn.find((text) => text.lines[0]?.y === "76");
      expect(description?.lines.map((line) => line.y)).toEqual(["76", "95"]);
      expect(drawn.some((text) => text.lines.some((line) => Number(line.y) >= 102))).toBe(false);
      const last = description?.lines[1];
      expect(last?.text.endsWith("…")).toBe(true);
      expect(end(last, ellipsisAdvance("repo-1", "reg", 13.5))).toBeLessThanOrEqual(400);
    });
  }

  test("light and dark place every glyph alike", () => {
    expect(geometry(render("repo-1", "dark"))).toEqual(geometry(render("repo-1", "light")));
  });
});

describe("year ring long texts stay within bounds", () => {
  test("a repository name of 20000 characters renders recent and repo-1", () => {
    const data = longTextProfileData();
    const huge = "n".repeat(20_000);
    const repositories = data.github.repositories.map((repository, index) =>
      index === 0 ? { ...repository, name: huge } : repository,
    );
    const github = {
      ...data.github,
      repositories,
      pinned: repositories,
      pushes: data.github.pushes.map((push) => ({ ...push, repository: huge })),
    };
    const recent = texts(render("recent", "light", { github }));
    expect(only(recent.find((text) => text.x === 100))?.text.endsWith("…")).toBe(true);
    const card = texts(render("repo-1", "light", { github }));
    const name = card.find((text) => text.x === 0 && text.lines[0]?.y === "30");
    expect(only(name)?.text.endsWith("…")).toBe(true);
  });

  test.each(["recent", "repo-1"] as const)(
    "the sample %s renders as its committed golden in both themes",
    (section) => {
      for (const theme of themes) {
        const golden = readFileSync(join(goldens, `${section}-${theme}.svg`), "utf8");
        const svg = renderProfile({
          template: "year-ring",
          design: loadExampleProfile("year-ring", section, theme),
          data: sampleProfileData(),
          time: 0,
        });
        expect(normalizeSvg(svg)).toBe(golden);
      }
    },
  );
});
