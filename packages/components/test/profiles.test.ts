import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultNodeTolerance } from "@readmint/golden";
import { comparePng, rasterizeSvg } from "@readmint/golden/node";
import { validateDesign, type Design } from "@readmint/format";
import { renderSvg, RenderLimits } from "@readmint/renderer";
import { describe, expect, test } from "vitest";
import { profileTemplates, type ProfileSection, type ProfileTemplate } from "../src/index.js";
import { embeddedFonts } from "../../renderer/test/embeddedFonts.js";
import { loadProfile, profileSource, renderProfile, type ProfileTheme } from "./profileDesigns.js";
import { sampleGitHubData } from "./sampleGitHubData.js";
import {
  otherProfileData,
  sampleProfileData,
  worstCaseProfileData,
  type ProfileData,
} from "./sampleProfileData.js";

const folders = join(import.meta.dirname, "..", "templates", "profiles");
const themes: readonly ProfileTheme[] = ["light", "dark"];
const names = Object.keys(profileTemplates) as ProfileTemplate[];
const cases = names.flatMap((template) =>
  profileTemplates[template].map((section) => [template, section] as const),
);

/** UTF-8 bytes one section may take on the worst-case data (docs/components.md): the starter budget. */
const sizeBudget = 524_288;
/** The year ring is held to half of that on the sample data. */
const ringBudget = 262_144;

const halvedLimits = {
  maxExpressionSteps: RenderLimits.maxExpressionSteps / 2,
  maxRepeatCopies: RenderLimits.maxRepeatCopies / 2,
};

const utf8Bytes = (svg: string) => new TextEncoder().encode(svg).length;
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function fileJson(template: ProfileTemplate, file: string): unknown {
  return JSON.parse(readFileSync(join(folders, template, file), "utf8"));
}

/** The text a section shows where the data it reads is missing (no status, pushes or repositories). */
const fallbackText: Readonly<Record<ProfileTemplate, Partial<Record<ProfileSection, string>>>> = {
  "year-ring": {
    header: "No recent push yet.",
    recent: "No recent pushes yet.",
    "repo-1": "No repository in slot 1.",
    "repo-4": "No repository in slot 4.",
  },
  horizon: {
    header: "No commits to show yet.",
    "repo-1": "No repository in slot 1.",
    "repo-4": "No repository in slot 4.",
  },
  pinscreen: {
    header: "no pushes yet",
    log: "no commits yet",
    "repo-1": "no repository in this slot yet",
  },
};

function withPatch(
  data: ProfileData,
  patch: Partial<ProfileData["github"]>,
): { github: ProfileData["github"] } {
  return { github: { ...data.github, ...patch } };
}

function pixelsEqual(left: string, right: string): void {
  const png = (svg: string) => rasterizeSvg(svg, 1, [], embeddedFonts(svg));
  const result = comparePng(png(left), png(right), defaultNodeTolerance);
  expect(result.pass, `${String(result.diffPixels)} pixels differ`).toBe(true);
}

describe.each(cases)("%s %s", (template, section) => {
  test.each(themes)("the %s design validates with no issues", (theme) => {
    expect(validateDesign(JSON.parse(profileSource(template, section, theme)))).toMatchObject({
      ok: true,
    });
  });

  test("has a transparent canvas and a theme enum on its one root instance", () => {
    const design = loadProfile(template, section);
    expect(design.canvas.background).toBeUndefined();
    expect(design.canvas.width).toBe(840);
    expect(design.layers).toHaveLength(1);
    const [root] = design.layers;
    if (root?.type !== "component") throw new Error("the root layer is not a component");
    const props = design.components?.[root.ref]?.props;
    expect(props?.["theme"]).toEqual({ type: "enum", values: ["light", "dark"], default: "light" });
    expect(root.props?.["theme"]).toBe("light");
    if (section.startsWith("repo-")) {
      expect(props?.["slot"]).toEqual({ type: "number", default: 0 });
      expect(root.props?.["slot"]).toBe(Number(section.slice(5)) - 1);
    } else {
      expect(props?.["slot"]).toBeUndefined();
    }
  });

  test("the dark twin is the light design with the root prop theme dark, nothing else", () => {
    const light = fileJson(template, `${section}.json`) as Design;
    const dark = fileJson(template, `${section}.dark.json`) as Design;
    const [root] = light.layers;
    if (root?.type !== "component") throw new Error("the root layer is not a component");
    expect(dark).toEqual({
      ...light,
      layers: [{ ...root, props: { ...root.props, theme: "dark" } }, ...light.layers.slice(1)],
    });
  });

  test("has a reader-facing title and description", () => {
    const design = loadProfile(template, section);
    expect(design.title?.length ?? 0).toBeGreaterThan(3);
    expect(design.description ?? "").not.toMatch(
      /theme|prop\b|props|assets|src\b|licence|replace/u,
    );
    expect((design.description ?? "").length).toBeGreaterThan(30);
    expect(design.description).not.toBe(design.title);
  });

  test("contains no login, name or address of any user", () => {
    for (const theme of themes) {
      const body = JSON.parse(profileSource(template, section, theme)) as Record<string, unknown>;
      delete body["$schema"];
      expect(JSON.stringify(body)).not.toMatch(
        /https?:|MrLarkyy|readmint-sample|other-dev|Sample Developer|Other Developer/iu,
      );
    }
  });

  test.each(themes)("renders the sample in the %s theme, the same bytes twice", (theme) => {
    const render = () =>
      renderProfile({
        template,
        design: loadProfile(template, section, theme),
        data: sampleProfileData(),
      });
    const svg = render();
    expect(render()).toBe(svg);
  });

  test("the SVG has no script, no event attribute and only data: references, on hostile data", () => {
    const hostile = withPatch(sampleProfileData(), {
      name: '<script>alert(1)</script>&"',
      bio: "<img onerror=x>",
      status: { emoji: null, message: "<svg onload=x>" },
      pushes: sampleProfileData().github.pushes.map((push) => ({
        ...push,
        message: '"><script>x</script>',
      })),
    });
    const svg = renderProfile({ template, design: loadProfile(template, section), data: hostile });
    expect(svg).not.toMatch(/<script|<image|<foreignObject|<[^>]*\son[a-z]+=/iu);
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(
      /https?:|file:|@import/iu,
    );
    for (const [, target] of svg.matchAll(/href="([^"]*)"/gu)) expect(target).toMatch(/^data:/u);
    for (const [, target] of svg.matchAll(/url\(([^)]*)\)/gu))
      expect(target).toMatch(/^(#|data:)/u);
  });

  test("renders plain github data, without the fields the loader does not produce yet, with no issue", () => {
    const svg = renderProfile({
      template,
      design: loadProfile(template, section),
      data: sampleGitHubData(),
    });
    const fallback = fallbackText[template][section];
    if (fallback !== undefined) expect(svg).toContain(fallback);
  });

  test("renders another user's data without the sample's", () => {
    const svg = renderProfile({
      template,
      design: loadProfile(template, section),
      data: otherProfileData(),
    });
    expect(svg).not.toMatch(/readmint-sample|Sample Developer|tinydb/iu);
    if (section === "header") expect(svg).toMatch(/other developer/iu);
  });

  test("stays within the budget and half the work limits on the worst-case data", () => {
    const svg = renderProfile({
      template,
      design: loadProfile(template, section),
      data: worstCaseProfileData(),
      limits: halvedLimits,
    });
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(sizeBudget);
  });

  test("the first frame is the final state: frame 0 and the frame at the end look alike", () => {
    const design = loadProfile(template, section);
    const timeline = design.animation;
    if (timeline === undefined) return;
    const frame = (time: number) =>
      renderProfile({ template, design, data: sampleProfileData(), time });
    pixelsEqual(frame(0), frame(timeline.duration));
  });

  test("the timeline loops exactly where the section is a ticker", () => {
    const timeline = loadProfile(template, section).animation;
    const ticker = template === "horizon" && (section === "header" || section === "stack");
    if (ticker) expect(timeline).toMatchObject({ loop: true });
    else if (timeline !== undefined) expect(timeline.loop).toBe(false);
  });
});

describe.each(names)("%s fonts", (template) => {
  const folder = join(folders, template, "fonts");
  const used = new Map<string, string>();
  for (const section of profileTemplates[template]) {
    for (const theme of themes) {
      for (const font of Object.values(loadProfile(template, section, theme).assets?.fonts ?? {})) {
        used.set(font.src, font.family);
      }
    }
  }
  const readme = readFileSync(join(folder, "README.md"), "utf8");

  test("every font a section names is a file here, embeddable under OFL-1.1, listed with its sha256", () => {
    expect(used.size).toBeGreaterThan(0);
    for (const [src, family] of used) {
      expect(src).toMatch(/^fonts\/[A-Za-z0-9-]+\.ttf$/u);
      const file = join(folders, template, src);
      expect(existsSync(file), src).toBe(true);
      expect(readme, src).toContain(sha256(readFileSync(file)));
      expect(family).toMatch(/^(Archivo|Archivo Condensed|Geist|Geist Mono)$/u);
    }
    for (const theme of themes) {
      for (const section of profileTemplates[template]) {
        for (const font of Object.values(
          loadProfile(template, section, theme).assets?.fonts ?? {},
        )) {
          expect(font.licence).toEqual({ embedding: "allowed", name: "OFL-1.1" });
        }
      }
    }
  });

  test("the folder holds exactly those fonts, the licence of each family and a README", () => {
    const files = readdirSync(folder).sort();
    const families = new Set([...used.values()].map((family) => family.split(" ")[0]));
    const licences = [...families].map((family) => `OFL-${String(family)}.txt`);
    expect(files).toEqual(
      [
        ...[...used.keys()].map((src) => src.slice("fonts/".length)),
        ...licences,
        "README.md",
      ].sort(),
    );
    for (const licence of licences) {
      expect(readFileSync(join(folder, licence), "utf8")).toContain(
        "SIL OPEN FONT LICENSE Version 1.1",
      );
    }
  });

  test("each font may be embedded: fsType 0 (installable) and no Reserved Font Name in the licence records", () => {
    for (const src of used.keys()) {
      const bytes = readFileSync(join(folders, template, src));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let os2 = -1;
      for (let index = 0; index < view.getUint16(4); index++) {
        const record = 12 + index * 16;
        if (bytes.toString("latin1", record, record + 4) === "OS/2")
          os2 = view.getUint32(record + 8);
      }
      expect(os2, src).toBeGreaterThan(0);
      expect(view.getUint16(os2 + 8), src).toBe(0);
      expect(bytes.toString("latin1")).not.toMatch(/with Reserved Font Name/u);
    }
  });
});

test("a font file shared by two templates is the same bytes in both", () => {
  const seen = new Map<string, string>();
  for (const template of names) {
    for (const file of readdirSync(join(folders, template, "fonts"))) {
      if (file === "README.md") continue;
      const digest = sha256(readFileSync(join(folders, template, "fonts", file)));
      expect(seen.get(file) ?? digest, file).toBe(digest);
      seen.set(file, digest);
    }
  }
});

describe("the animation of the profile sections", () => {
  const render = (template: ProfileTemplate, section: ProfileSection, time?: number) =>
    renderProfile({
      template,
      design: loadProfile(template, section),
      data: sampleProfileData(),
      ...(time === undefined ? {} : { time }),
    });

  test("a one-shot track starts at its final value: the first frame of a [final, initial, final] track is final", () => {
    const design = {
      version: 0,
      canvas: { width: 100, height: 20 },
      animation: { duration: 1000, loop: false },
      layers: [
        {
          type: "rect",
          width: 10,
          height: 10,
          fill: "#ff0000",
          animate: {
            x: {
              keyframes: [
                { offset: 0, value: 80 },
                { offset: 0, value: 0 },
                { offset: 1, value: 80 },
              ],
            },
          },
        },
      ],
    };
    const result = validateDesign(design);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    const frame = (time: number) => {
      const out = renderSvg(result.value, { data: {}, time });
      if (!out.ok) throw new Error(JSON.stringify(out.issues));
      return out.svg;
    };
    expect(frame(0)).toContain("translate(80 0)");
    expect(frame(500)).toContain("translate(40 0)");
    expect(frame(1000)).toBe(frame(0));
  });

  test("the year ring shares three rotation rules between all its day groups", () => {
    const svg = render("year-ring", "year");
    const css = /<style>(.*?)<\/style>/su.exec(svg)?.[1] ?? "";
    const rotating = css
      .split("@keyframes ")
      .slice(1)
      .filter((rule) => rule.includes("rotate("));
    expect(rotating.length).toBeGreaterThan(0);
    expect(rotating.length).toBeLessThanOrEqual(4);
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(ringBudget);
  });

  test("the year ring moves: a quarter turn in, the ring looks different", () => {
    const first = render("year-ring", "year", 0);
    const later = render("year-ring", "year", 15000);
    expect(later).not.toBe(first);
  });

  test.each([
    ["year-ring", 54, 62],
    ["horizon", 110, 112],
    ["pinscreen", 28, 34],
  ] as const)("the odometer of %s reads the total in its first frame", (template, size, row) => {
    const svg = render(template, "year", 0);
    const digits = [
      ...svg.matchAll(new RegExp(`font-size="${String(size)}"[^>]*>(.*?)</text>`, "gu")),
    ]
      .map(([, body]) =>
        [...(body ?? "").matchAll(/y="(-?[\d.]+)">(\d)<\/tspan>/gu)].filter(
          ([, y]) => Number(y) > 0 && Number(y) < row,
        ),
      )
      .filter((visible) => visible.length === 1)
      .map((visible) => visible[0]?.[2])
      .join("");
    expect(digits).toBe(String(sampleProfileData().github.contributions.total));
  });

  test.each([365, 366, 371])(
    "the horizon terrain draws the latest day of a calendar of %s days",
    (length) => {
      const sample = sampleProfileData();
      const base = sample.github.contributions.days;
      const days = Array.from({ length }, (_, index) => ({
        ...(base[index % base.length] as (typeof base)[number]),
        count: 0,
        level: 0 as const,
      }));
      const terrain = (last: number) =>
        renderProfile({
          template: "horizon",
          design: loadProfile("horizon", "year"),
          data: withPatch(sample, {
            contributions: {
              ...sample.github.contributions,
              days: days.map((day, index) =>
                index === length - 1 ? { ...day, count: last } : day,
              ),
            },
          }),
        });
      expect(terrain(64)).not.toBe(terrain(0));
    },
  );

  test("a streak of one day reads '1 day'", () => {
    const sample = sampleProfileData();
    const one = { length: 1, start: "2026-01-02", end: "2026-01-02" };
    const data = withPatch(sample, {
      contributions: {
        ...sample.github.contributions,
        streaks: { current: one, longest: one },
      },
    });
    const text = (template: ProfileTemplate) =>
      renderProfile({ template, design: loadProfile(template, "year"), data });
    expect(text("year-ring")).toContain(">1 day<");
    expect(text("horizon")).toContain(">1 DAY<");
    expect(text("year-ring")).not.toContain("1 days");
  });

  test("a long name is cut to its limit and never reaches the end of the canvas", () => {
    const data = withPatch(sampleProfileData(), { name: "W".repeat(1024) });
    for (const template of names) {
      const svg = renderProfile({ template, design: loadProfile(template, "header"), data });
      expect(svg).not.toContain("W".repeat(40));
      expect(svg).toContain("…");
    }
  });

  test("empty pushes show the fallback line in header, recent and log", () => {
    const data = withPatch(sampleProfileData(), { pushes: [] });
    for (const [template, section] of [
      ["year-ring", "header"],
      ["year-ring", "recent"],
      ["horizon", "header"],
      ["pinscreen", "header"],
      ["pinscreen", "log"],
    ] as const) {
      const svg = renderProfile({ template, design: loadProfile(template, section), data });
      expect(svg, `${template} ${section}`).toContain(fallbackText[template][section] ?? "!");
    }
  });
});

describe.each(names)("%s example README", (template) => {
  const readme = readFileSync(join(folders, template, "README.md"), "utf8");
  const sections = profileTemplates[template];

  test("switches every section to its dark twin with prefers-color-scheme", () => {
    for (const section of sections) {
      expect(readme, section).toContain(
        `<source media="(prefers-color-scheme: dark)" srcset="readmint/${section}.dark.svg">`,
      );
      expect(readme, section).toContain(`src="readmint/${section}.svg"`);
    }
  });

  test("wraps each repository and the contact footer in a link around its picture", () => {
    for (const section of sections.filter(
      (name) => name.startsWith("repo-") || name === "footer",
    )) {
      expect(readme, section).toMatch(
        new RegExp(
          String.raw`<a href="https://github\.com/[^"]+">\s*<picture>(?:(?!</picture>)[\s\S])*readmint/${section}\.svg`,
          "u",
        ),
      );
    }
    expect(readme).not.toMatch(
      /<a [^>]*>\s*<picture>(?:(?!<\/picture>)[\s\S])*readmint\/(header|year)\.svg/u,
    );
  });

  test("lists the light designs for the Action and no dark twin", () => {
    const listed = [...readme.matchAll(/^\s+readmint\/designs\/(\S+)$/gmu)].map(
      (match) => match[1],
    );
    expect(listed).toEqual(sections.map((section) => `${template}/${section}.json`));
  });
});
