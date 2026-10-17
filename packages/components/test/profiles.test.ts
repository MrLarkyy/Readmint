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
import {
  loadExampleProfile,
  loadProfile,
  profileSource,
  renderProfile,
  type ProfileTheme,
} from "./profileDesigns.js";
import { profileExampleProps } from "@readmint/examples/props";
import { sampleGitHubData } from "./sampleGitHubData.js";
import {
  otherProfileData,
  sampleProfileData,
  sparseProfileData,
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

/** The sections with a motion that never ends (tickers, pulses, the turning ring, the ripple, a blinking caret). */
const loops: Readonly<Record<ProfileTemplate, readonly ProfileSection[]>> = {
  "year-ring": ["header", "year", "repo-1", "repo-2", "repo-3", "repo-4", "repo-5", "repo-6"],
  horizon: ["header", "ticker", "year", "worked"],
  pinscreen: ["header", "year", "log"],
};

/** The personal texts of the example (test/profileExampleProps.ts): no template file may hold one. */
const exampleValues =
  /MrLarkyy|Tade[aá][sš]|Ganzwohl|aquatic|Hoplite|Minebox|Cobblemon|Mineclub|SWN|Moravia|we\.builders|\bPartners\b|MrBeast|SpeedSilver|DiamondXR|Minecraft|KRepo|KEvent|KLocale|KRegistry/iu;

/** The text a section shows where the data it reads is missing (no status, pushes or repositories). */
const fallbackText: Readonly<Record<ProfileTemplate, Partial<Record<ProfileSection, string>>>> = {
  "year-ring": {
    header: "No recent push yet.",
    recent: "No recent pushes yet.",
    "repo-1": "No repository in slot 1.",
    "repo-4": "No repository in slot 4.",
  },
  horizon: {
    ticker: "No commits to show yet.",
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
    // the repository cards of year-ring and pinscreen sit two to a row (README), horizon's rows are full width
    const narrow = section.startsWith("repo-") && template !== "horizon";
    expect(design.canvas.width).toBe(narrow ? 412 : 840);
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

  test("contains no login, name, address or personal text of any user", () => {
    for (const theme of themes) {
      const body = JSON.parse(profileSource(template, section, theme)) as Record<string, unknown>;
      delete body["$schema"];
      expect(JSON.stringify(body)).not.toMatch(
        /https?:|MrLarkyy|readmint-sample|other-dev|Sample Developer|Other Developer/iu,
      );
      expect(JSON.stringify(body)).not.toMatch(exampleValues);
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

  test("the timeline loops exactly where the section moves without end", () => {
    const timeline = loadProfile(template, section).animation;
    if (loops[template].includes(section)) expect(timeline).toMatchObject({ loop: true });
    else if (timeline !== undefined) expect(timeline.loop).toBe(false);
  });
});

describe.each(names)("%s repository slots", (template) => {
  const slots = profileTemplates[template].filter((section) => section.startsWith("repo-"));

  test.each(themes.flatMap((theme) => slots.slice(1).map((slot) => [theme, slot] as const)))(
    "the %s design of %s is repo-1 with the slot prop changed, nothing else",
    (theme, slot) => {
      const file = (section: string) =>
        theme === "dark" ? `${section}.dark.json` : `${section}.json`;
      const first = fileJson(template, file("repo-1")) as Design;
      const other = fileJson(template, file(slot)) as Design;
      const [root] = first.layers;
      if (root?.type !== "component") throw new Error("the root layer is not a component");
      expect(other).toEqual({
        ...first,
        layers: [
          { ...root, props: { ...root.props, slot: Number(slot.slice(5)) - 1 } },
          ...first.layers.slice(1),
        ],
      });
    },
  );
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
      expect(family).toMatch(
        /^(Archivo|Archivo SemiExpanded|Archivo SemiCondensed|Archivo ExtraCondensed|Geist|Geist Mono)$/u,
      );
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

  test("the year ring's day orbits share two turn rules: once round and twice back", () => {
    const svg = render("year-ring", "year");
    const css = /<style>(.*?)<\/style>/su.exec(svg)?.[1] ?? "";
    const rotating = css
      .split("@keyframes ")
      .slice(1)
      .filter((rule) => rule.includes("rotate("));
    expect(rotating).toHaveLength(2);
    expect(rotating.some((rule) => rule.includes("rotate(-360deg)"))).toBe(true);
    expect(rotating.some((rule) => rule.includes("rotate(720deg)"))).toBe(true);
    expect(utf8Bytes(svg)).toBeLessThanOrEqual(ringBudget);
  });

  test("the year ring moves: a quarter turn in, the ring looks different", () => {
    const first = render("year-ring", "year", 0);
    const later = render("year-ring", "year", 15000);
    expect(later).not.toBe(first);
  });

  test.each([
    ["year-ring", 58, 65],
    ["horizon", 100, 112],
    ["pinscreen", 48, 54],
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

  test.each([["year-ring", "OCT 2024 — OCT 2025"]] as const)(
    "the date range of %s names the year of both ends",
    (template, range) => {
      const sample = sampleProfileData();
      const data = withPatch(sample, {
        contributions: { ...sample.github.contributions, from: "2024-10-16", to: "2025-10-15" },
      });
      const svg = renderProfile({ template, design: loadProfile(template, "year"), data });
      expect(svg).toContain(`>${range}<`);
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
    expect(text("year-ring")).toContain(">Longest streak, 1 day<");
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
      ["horizon", "ticker"],
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

/** The terrain faces of a horizon year frame: four corners, fill and stroke, in drawing order. */
function terrainFaces(svg: string) {
  return [...svg.matchAll(/<path d="M([^"]+)Z"([^>]*)\/>/gu)]
    .filter(([, , attributes]) => / stroke-width="0\.5"/u.test(attributes ?? ""))
    .map(([, d, attributes]) => ({
      corners: (d ?? "")
        .split(/[ML]/u)
        .map((pair) => pair.trim())
        .filter((pair) => pair !== "")
        .map((pair) => pair.split(/[ ,]+/u).map(Number) as [number, number]),
      fill: / fill="(#[0-9a-f]{6})"/u.exec(attributes ?? "")?.[1] ?? "",
      stroke: / stroke="(#[0-9a-f]{6})"/u.exec(attributes ?? "")?.[1] ?? "",
    }));
}

/** Whether p lies inside or on the convex quad q (either winding). */
function inQuad(p: readonly [number, number], q: readonly (readonly [number, number])[]): boolean {
  const signs = q.map((a, i) => {
    const b = q[(i + 1) % q.length] ?? a;
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  });
  return signs.every((v) => v >= -1e-6) || signs.every((v) => v <= 1e-6);
}

describe("the horizon terrain", () => {
  const sample = sampleProfileData();
  const frame = (data: ProfileData) =>
    renderProfile({ template: "horizon", design: loadProfile("horizon", "year"), data, time: 0 });

  test.each([364, 365, 366, 367, 368, 369, 370, 371])(
    "covers its grid row by row from back to front on a calendar of %s days",
    (length) => {
      const base = sample.github.contributions.days;
      const days = Array.from({ length }, (_, index) => ({
        ...(base[index % base.length] as (typeof base)[number]),
        count: 0,
        level: 0 as const,
      }));
      const faces = terrainFaces(
        frame(withPatch(sample, { contributions: { ...sample.github.contributions, days } })),
      );
      expect(faces).toHaveLength(624);
      const rows = Array.from({ length: 12 }, (_, row) => faces.slice(row * 52, row * 52 + 52));
      const meanY = rows.map(
        (row) =>
          row.flatMap((face) => face.corners.map(([, y]) => y)).reduce((a, b) => a + b, 0) /
          (row.length * 4),
      );
      for (let row = 1; row < 12; row++)
        expect(meanY[row], `row ${String(row)}`).toBeGreaterThan(meanY[row - 1] ?? 0);
      const front = Math.max(...faces.flatMap((face) => face.corners.map(([, y]) => y)));
      for (const face of faces)
        for (const [, y] of face.corners) expect(y).toBeLessThanOrEqual(front);
      // the back edge, the front edge and the sides bound the grid; every point inside lies in a face
      const corner = (row: number, column: number, index: number) =>
        rows[row]?.[column]?.corners[index] ?? [0, 0];
      const backLeft = corner(0, 0, 0),
        backRight = corner(0, 51, 1);
      const frontRight = corner(11, 51, 2),
        frontLeft = corner(11, 0, 3);
      const lerp = (a: readonly number[], b: readonly number[], t: number) =>
        [
          (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * t,
          (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * t,
        ] as const;
      for (let v = 0.01; v < 1; v += 0.0245) {
        for (let u = 0.004; u < 1; u += 0.0097) {
          const point = lerp(lerp(backLeft, backRight, u), lerp(frontLeft, frontRight, u), v);
          expect(
            faces.some((face) => inQuad(point, face.corners)),
            `${point[0].toFixed(1)},${point[1].toFixed(1)}`,
          ).toBe(true);
        }
      }
    },
  );

  test("is shaded on a sparse, spiky calendar: many fills, few accent faces, every face outlined", () => {
    const faces = terrainFaces(frame(sparseProfileData()));
    expect(faces).toHaveLength(624);
    expect(new Set(faces.map((face) => face.fill)).size).toBeGreaterThanOrEqual(6);
    expect(accentFaces(faces).length).toBeLessThanOrEqual(624 * 0.15);
    for (const face of faces) expect(face.stroke).not.toBe(face.fill);
  });

  test.each([
    ["the worst-case data", () => worstCaseProfileData()],
    ["a constant calendar of 371 days", () => calendarOf(Array.from({ length: 371 }, () => 9))],
  ])("stays below the totals and grey, without an accent band, on %s", (_, data) => {
    const faces = terrainFaces(frame(data()));
    expect(faces).toHaveLength(624);
    // the totals end with the busiest_day label at y 133; a full-height back row reaches y 163
    for (const face of faces) for (const [, y] of face.corners) expect(y).toBeGreaterThan(140);
    expect(accentFaces(faces)).toHaveLength(0);
  });

  test("still tints the peaks that rise above an even calendar", () => {
    const counts = Array.from({ length: 371 }, (_, index) =>
      index >= 180 && index < 200 ? 400 : 4,
    );
    const accent = accentFaces(terrainFaces(frame(calendarOf(counts)))).length;
    expect(accent).toBeGreaterThan(0);
    expect(accent).toBeLessThanOrEqual(624 * 0.15);
  });
});

/** The faces of a light terrain in the accent: #E8590C pulls red far above blue, the ink greys keep them equal. */
function accentFaces(faces: ReturnType<typeof terrainFaces>) {
  return faces.filter(({ fill }) => {
    const [r, , b] = [1, 3, 5].map((i) => parseInt(fill.slice(i, i + 2), 16));
    return (r ?? 0) - (b ?? 0) > 15;
  });
}

/** The sample data with a calendar of these counts, its total written the way the loader writes it. */
function calendarOf(counts: readonly number[]): { github: ProfileData["github"] } {
  const sample = sampleProfileData();
  const base = sample.github.contributions.days;
  const days = counts.map((count, index) => ({
    ...(base[index % base.length] as (typeof base)[number]),
    count,
  }));
  const total = counts.reduce((sum, count) => sum + count, 0);
  return withPatch(sample, { contributions: { ...sample.github.contributions, days, total } });
}

describe("the repository slots without a pinned list", () => {
  // the loader's data: repositories without weeklyCommits and no pinned list; the least starred first
  const ranked = sampleProfileData().github.repositories;
  const repositories = ranked
    .map((entry) =>
      Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "weeklyCommits")),
    )
    .reverse();
  const data = { github: { ...sampleGitHubData().github, repositories } };
  const first = String(repositories[0]?.name);
  const shown: Readonly<Record<ProfileTemplate, string>> = {
    "year-ring": `>${first}<`,
    horizon: `>${(ranked[0]?.name ?? "").toUpperCase()}<`,
    pinscreen: `>${first}.kt<`,
  };

  test.each(names)("%s repo-1 shows a repository of github.repositories", (template) => {
    for (const theme of themes) {
      const svg = renderProfile({ template, design: loadProfile(template, "repo-1", theme), data });
      expect(svg).toContain(shown[template]);
      expect(svg).not.toContain(fallbackText[template]["repo-1"]);
    }
  });
});

describe("the page-coloured fades", () => {
  const page = /#ffffff|#0d1117/u;
  type Painted = { type?: string; x?: unknown; width?: unknown; fill?: unknown };
  type Gradient = { type: string; stops: readonly { color: string }[] };
  const gradients = (node: unknown, out: { layer: Painted; fill: Gradient }[] = []) => {
    if (Array.isArray(node)) for (const item of node) gradients(item, out);
    else if (typeof node === "object" && node !== null) {
      const fill = (node as Painted).fill;
      if (typeof fill === "object" && fill !== null && "stops" in fill)
        out.push({ layer: node, fill: fill as Gradient });
      for (const value of Object.values(node)) gradients(value, out);
    }
    return out;
  };

  test.each(cases)(
    "%s %s draws no page-coloured box: each fade runs out to transparent",
    (template, section) => {
      const design = loadProfile(template, section);
      for (const { layer, fill } of gradients(design.components)) {
        if (!fill.stops.some(({ color }) => page.test(color))) continue;
        const alphas = fill.stops.map(
          ({ color }) => /\+ "([0-9a-f]{2})" \}\}$/u.exec(color)?.[1] ?? "ff",
        );
        if (fill.type === "radial") {
          expect(layer.type).toBe("ellipse");
          expect(alphas.at(-1)).toBe("00");
        } else {
          // a linear edge fade: opaque only at the canvas edge, transparent where it meets the content
          expect(alphas).toContain("00");
          expect(
            layer.x === 0 || Number(layer.x) + Number(layer.width) === design.canvas.width,
          ).toBe(true);
        }
      }
    },
  );

  test("finds the fades it checks: the ring's veil and the shade behind its total", () => {
    const fades = gradients(loadProfile("year-ring", "year").components).filter(({ fill }) =>
      fill.stops.some(({ color }) => page.test(color)),
    );
    expect(fades.map(({ layer }) => layer.type)).toEqual(["ellipse", "ellipse"]);
  });
});

describe("the year sections on a sparse, spiky calendar", () => {
  test.each(names)(
    "%s renders it in both themes within the budget and half the limits",
    (template) => {
      for (const theme of themes) {
        const svg = renderProfile({
          template,
          design: loadProfile(template, "year", theme),
          data: sparseProfileData(),
          limits: halvedLimits,
        });
        expect(utf8Bytes(svg)).toBeLessThanOrEqual(sizeBudget);
      }
    },
  );
});

/** Texts each section shows only with the example's personal texts set. */
const personalTexts: Readonly<Record<ProfileTemplate, Partial<Record<ProfileSection, string>>>> = {
  "year-ring": {
    header: "Backend engineer working in Kotlin",
    index: ">Backend systems and internal tooling<",
    footer: ">Open to long-term collaborations.<",
  },
  horizon: {
    header: ">Messaging systems,<",
    stack: ">RabbitMQ<",
    worked: ">HOPLITE<",
    footer: ">COLLABORATIONS.<",
  },
  pinscreen: {
    header: ">Backend engineer. Kotlin, the JVM and messaging systems.<",
    stack: ">redis, rabbitmq, nats<",
    footer: ">Open to long-term collaborations.<",
  },
};

describe.each(names)("%s personal texts", (template) => {
  const sections = Object.keys(personalTexts[template]) as ProfileSection[];

  test.each(sections)("%s shows them as root props and hides them when empty", (section) => {
    const filled = renderProfile({
      template,
      design: loadExampleProfile(template, section),
      data: sampleProfileData(),
    });
    expect(filled).toContain(personalTexts[template][section]);
    const empty = renderProfile({
      template,
      design: loadProfile(template, section),
      data: withPatch(sampleProfileData(), { bio: null }),
    });
    expect(empty).not.toContain(personalTexts[template][section]);
    expect(empty).not.toMatch(/>[^<]*\b(undefined|null)\b[^<]*</u);
  });

  test("every root prop a section declares has an empty default, and the example sets only declared props", () => {
    for (const section of profileTemplates[template]) {
      const design = loadProfile(template, section);
      const [root] = design.layers;
      if (root?.type !== "component") throw new Error("the root layer is not a component");
      const declared = design.components?.[root.ref]?.props ?? {};
      for (const [name, prop] of Object.entries(declared)) {
        if (name === "theme" || name === "slot") continue;
        const fallback =
          name === "branch"
            ? "main"
            : name === "languagesAfter"
              ? 2
              : name === "logosRow"
                ? -1
                : name === "languageShare"
                  ? "bytes"
                  : undefined;
        if (fallback !== undefined) expect(prop.default, name).toBe(fallback);
        else expect(prop.default, `${section} ${name}`).toEqual(prop.type === "array" ? [] : "");
      }
      for (const name of Object.keys(profileExampleProps[template]?.[section] ?? {}))
        expect(Object.keys(declared), `${section} ${name}`).toContain(name);
    }
  });
});

describe("profile example props", () => {
  test("the horizon worked-with line lists the delivery partners and every item is drawn", () => {
    const items = profileExampleProps["horizon"]?.["worked"]?.["items"];
    expect(items).toEqual(expect.arrayContaining(["SWN Moravia", "we.builders", "Partners"]));
    expect(items).toHaveLength(10);
    const svg = renderProfile({
      template: "horizon",
      design: loadExampleProfile("horizon", "worked"),
      data: sampleProfileData(),
    });
    for (const item of items as readonly string[]) expect(svg).toContain(`>${item.toUpperCase()}<`);
  });

  test("every template and section they name exists", () => {
    for (const [template, sections] of Object.entries(profileExampleProps)) {
      expect(Object.keys(profileTemplates), template).toContain(template);
      const known: readonly string[] = profileTemplates[template as ProfileTemplate];
      for (const section of Object.keys(sections))
        expect(known, `${template}/${section}`).toContain(section);
    }
  });
});
