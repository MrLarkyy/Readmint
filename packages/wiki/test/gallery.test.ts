import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildGallery,
  buildWiki,
  galleryImagePath,
  galleryTemplates,
  onPageColour,
  writeWiki,
  type GalleryTemplate,
} from "../src/index.js";
import { goldenDir, readGoldenImages } from "./goldenImages.js";

const docsDir = fileURLToPath(new URL("../../../docs/", import.meta.url));
const templatesDir = fileURLToPath(new URL("../../components/templates/", import.meta.url));
const options = { repository: "https://example.test/o/r", branch: "main" };
const links = options;

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  if (start < 0) throw new Error(`docs/components.md has no "${heading}" section`);
  const rest = markdown.slice(start + 1);
  // The tables under test come before the first sub-heading of the section.
  const end = rest.search(/\n###? /);
  return end < 0 ? rest : rest.slice(0, end);
}

function rows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

function names(cell: string): string[] {
  const found = [...cell.matchAll(/`([a-z0-9-]+)`( to `([a-z0-9-]+)`)?/g)];
  return found.flatMap((match) => {
    const first = match[1] ?? "";
    const last = match[3];
    if (last === undefined) return [first];
    const prefix = first.replace(/\d+$/, "");
    const from = Number(first.slice(prefix.length));
    const to = Number(last.slice(prefix.length));
    return Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i)}`);
  });
}

const components = readFileSync(docsDir + "components.md", "utf8").replace(/\r\n/g, "\n");
const images = readGoldenImages();

function png(width: number, height: number, rgba: [number, number, number, number]): Uint8Array {
  const image = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) image.data.set(rgba, i * 4);
  return new Uint8Array(PNG.sync.write(image));
}

function noisePng(width: number, height: number, seed: number): Uint8Array {
  const image = new PNG({ width, height });
  let state = (seed + 1) * 2654435761;
  for (let i = 0; i < image.data.length; i++) {
    state = Math.imul(state ^ (state >>> 15), 2246822519) + 374761393;
    image.data[i] = i % 4 === 3 ? 255 : (state >>> 16) & 255;
  }
  return new Uint8Array(PNG.sync.write(image));
}

function pixel(data: Uint8Array): number[] {
  const image = PNG.sync.read(Buffer.from(data));
  return [...image.data.subarray(0, 4)];
}

describe("the gallery list", () => {
  it("equals the profile, starter and calendar tables of docs/components.md", () => {
    const calendars = rows(section(components, "Contribution calendar")).map((row) => row[0] ?? "");
    const starters = rows(section(components, "Starter templates")).map((row) => row[0] ?? "");
    const profileSection = section(components, "Profile templates");
    const tables = rows(profileSection);
    const profiles = tables.filter((row) => row.length === 4).map((row) => names(row[0] ?? "")[0]);
    expect(galleryTemplates.map((t) => t.name)).toEqual([
      ...profiles,
      ...starters.map((cell) => names(cell)[0]),
      ...calendars.map((cell) => names(cell)[0]),
    ]);
    expect(galleryTemplates.filter((t) => t.kind === "profile").map((t) => t.name)).toEqual(
      profiles,
    );
    for (const row of tables.filter((r) => r.length === 2)) {
      const template = galleryTemplates.find((t) => t.name === names(row[0] ?? "")[0]);
      expect(template?.items, row[0]).toEqual(names(row[1] ?? ""));
    }
  });

  it("equals the profile folders, starter and calendar design files on disk", () => {
    const profiles = readdirSync(`${templatesDir}profiles`, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const designs = readdirSync(templatesDir)
      .filter((file) => file.endsWith(".design.json"))
      .map((file) => file.slice(0, -".design.json".length));
    const starters = designs.filter((name) => !name.startsWith("calendar-"));
    const calendars = designs.filter((name) => name.startsWith("calendar-"));
    const listed = (kind: string): string[] =>
      galleryTemplates.filter((t) => t.kind === kind).map((t) => t.name);
    expect(listed("profile").sort()).toEqual(profiles.sort());
    expect(listed("starter").sort()).toEqual(starters.sort());
    expect(listed("calendar").sort()).toEqual(calendars.sort());
  });

  it("equals the sections in the template folders", () => {
    for (const template of galleryTemplates) {
      if (template.kind !== "profile") {
        expect(existsSync(`${templatesDir}${template.name}.design.json`), template.name).toBe(true);
        expect(template.items).toEqual([template.name]);
        continue;
      }
      const manifest = JSON.parse(
        readFileSync(`${templatesDir}profiles/${template.name}/renders.json`, "utf8"),
      ) as { renders: { name: string }[] };
      expect([...template.items], template.name).toEqual(manifest.renders.map((r) => r.name));
    }
  });

  it("has a golden image for every item in light and dark", () => {
    for (const template of galleryTemplates) {
      for (const item of template.items) {
        for (const theme of ["light", "dark"] as const) {
          const path = galleryImagePath(template, item, theme);
          expect(existsSync(goldenDir + path), path).toBe(true);
        }
      }
    }
  });
});

describe("the Gallery page", () => {
  const docs = new Map([["x.md", "# X\n"]]);
  const page = buildGallery(images, galleryTemplates, links);

  it("lists every template with a light and a dark image per item and the links", () => {
    for (const template of galleryTemplates) {
      expect(
        page.page.match(new RegExp(`^## ${template.title}$`, "gm"))?.length,
        template.title,
      ).toBe(1);
      for (const item of template.items) {
        for (const theme of ["light", "dark"]) {
          expect(page.page).toContain(`![${template.title}, ${item}, ${theme}](gallery/`);
        }
      }
      expect(page.page).toContain("](Components-and-templates#");
    }
    for (const template of galleryTemplates.filter((t) => t.kind === "profile")) {
      expect(page.page).toContain(
        `](https://github.com/MrLarkyy/readmint-template-test/tree/HEAD/${template.name})`,
      );
    }
    expect(page.page).toContain(
      "](https://example.test/o/r/blob/main/packages/components/templates/banner.design.json)",
    );
    for (const template of galleryTemplates.filter((t) => t.kind === "calendar")) {
      expect(page.page).toContain(
        `](https://example.test/o/r/blob/main/packages/components/templates/${template.name}.design.json)`,
      );
    }
    expect(page.page).toContain("](Components-and-templates#contribution-calendar)");
  });

  it("shows the three calendars in light and dark, opaque on the page colour of the theme", () => {
    const calendars = galleryTemplates.filter((t) => t.kind === "calendar");
    expect(calendars.map((t) => t.name)).toEqual([
      "calendar-heatmap",
      "calendar-isometric",
      "calendar-dots",
    ]);
    for (const { name, title } of calendars) {
      for (const [theme, colour] of [
        ["light", [255, 255, 255, 255]],
        ["dark", [13, 17, 23, 255]],
      ] as const) {
        const alt = `![${title}, ${name}, ${theme}](gallery/`;
        const start = page.page.indexOf(alt);
        const target =
          start < 0 ? undefined : page.page.slice(start + alt.length - 8).split(")")[0];
        expect(target, `${name} ${theme}`).toBeDefined();
        const image = PNG.sync.read(Buffer.from(page.files.get(target ?? "") ?? new Uint8Array()));
        expect([...image.data.subarray(0, 4)], `${name} ${theme}`).toEqual([...colour]);
        for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
      }
    }
  });

  it("points every image at a written file", () => {
    for (const match of page.page.matchAll(/\]\((gallery\/[^)]+)\)/g)) {
      expect(page.files.has(match[1] ?? ""), match[1]).toBe(true);
    }
    for (const name of page.files.keys()) expect(page.page).toContain(`](${name})`);
  });

  it("fails naming the golden when an image is missing", () => {
    const partial = new Map(images);
    partial.delete("templates/banner-dark.png");
    expect(() => buildGallery(partial, galleryTemplates, links)).toThrow(
      "golden templates/banner-dark.png is missing",
    );
    expect(() => buildWiki(docs, { ...options, images: partial, pages: [] })).toThrow(
      "golden templates/banner-dark.png is missing",
    );
  });

  it("stays inside the size budget and is deterministic", () => {
    let total = 0;
    for (const bytes of page.files.values()) {
      total += bytes.byteLength;
      expect(bytes.byteLength).toBeLessThanOrEqual(512 * 1024);
    }
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(buildGallery(images, galleryTemplates, links)).toEqual(page);
  });

  it("flattens every preview opaque on the page colour of its theme", () => {
    const [light, dark] = [
      page.page.match(/!\[Banner, banner, light\]\((gallery\/[^)]+)\)/)?.[1] ?? "",
      page.page.match(/!\[Banner, banner, dark\]\((gallery\/[^)]+)\)/)?.[1] ?? "",
    ];
    const lightImage = PNG.sync.read(Buffer.from(page.files.get(light) ?? new Uint8Array()));
    const darkImage = PNG.sync.read(Buffer.from(page.files.get(dark) ?? new Uint8Array()));
    expect(lightImage.data.subarray(0, 4)).toEqual(Buffer.from([255, 255, 255, 255]));
    expect(darkImage.data.subarray(0, 4)).toEqual(Buffer.from([13, 17, 23, 255]));
    for (const image of [lightImage, darkImage]) {
      for (let i = 3; i < image.data.length; i += 4) expect(image.data[i]).toBe(255);
    }
  });

  it("names images by content and writes identical images once", () => {
    const same: GalleryTemplate[] = [
      { name: "a", title: "A", kind: "starter", description: "a", items: ["a", "b"] },
    ];
    const bytes = png(2, 2, [10, 20, 30, 255]);
    const built = buildGallery(
      new Map([
        ["templates/a-light.png", bytes],
        ["templates/b-light.png", bytes],
        ["templates/a-dark.png", png(2, 2, [1, 2, 3, 255])],
        ["templates/b-dark.png", png(2, 2, [1, 2, 3, 255])],
      ]),
      same,
      links,
    );
    expect(built.files.size).toBe(2);
    const targets = [...built.page.matchAll(/\]\((gallery\/[^)]+)\)/g)].map((m) => m[1]);
    expect(targets[0]).toBe(targets[1]);
    expect(targets[2]).toBe(targets[3]);
    expect(targets[0]).toMatch(/^gallery\/[0-9a-f]{16}\.png$/);
  });

  it("refuses an image over the per-file limit, naming the golden", () => {
    const one: GalleryTemplate[] = [
      { name: "a", title: "A", kind: "starter", description: "a", items: ["a"] },
    ];
    const big = noisePng(400, 400, 1);
    expect(big.byteLength).toBeGreaterThan(512 * 1024);
    expect(() =>
      buildGallery(
        new Map([
          ["templates/a-light.png", big],
          ["templates/a-dark.png", big],
        ]),
        one,
        links,
      ),
    ).toThrow(/gallery image templates\/a-light\.png: .*byte limit/);
  });

  it("refuses a flattened image over the per-file limit when its source is under the input limit", () => {
    // 8-bit grayscale noise stays under 512 KiB, but flattened to RGB it is three times larger.
    const gray = new PNG({ width: 700, height: 700 });
    let state = 12345;
    for (let i = 0; i < gray.data.length; i += 4) {
      state = Math.imul(state ^ (state >>> 15), 2246822519) + 374761393;
      const value = (state >>> 16) & 255;
      gray.data.set([value, value, value, 255], i);
    }
    const source = new Uint8Array(PNG.sync.write(gray, { colorType: 0, inputColorType: 6 }));
    expect(source.byteLength).toBeLessThan(512 * 1024);
    const one: GalleryTemplate[] = [
      { name: "a", title: "A", kind: "starter", description: "a", items: ["a"] },
    ];
    expect(() =>
      buildGallery(
        new Map([
          ["templates/a-light.png", source],
          ["templates/a-dark.png", source],
        ]),
        one,
        links,
      ),
    ).toThrow(/gallery image templates\/a-light\.png is \d+ bytes, over the 524288 byte budget/);
  });

  it("refuses a PNG with a second IHDR or interlacing before decoding it", () => {
    const real = png(1, 1, [0, 0, 0, 255]);
    const chunk = (name: string, data: number[]): number[] => {
      const out = Buffer.alloc(12 + data.length);
      out.writeUInt32BE(data.length, 0);
      out.write(name, 4, "ascii");
      Buffer.from(data).copy(out, 8);
      return [...out];
    };
    const ihdr = (side: number, interlace: number): number[] => {
      const data = Buffer.alloc(13);
      data.writeUInt32BE(side, 0);
      data.writeUInt32BE(side, 4);
      data.set([8, 6, 0, 0, interlace], 8);
      return [...data];
    };
    const sig = [...real.subarray(0, 8)];
    const twice = new Uint8Array([
      ...sig,
      ...chunk("IHDR", ihdr(1, 0)),
      ...chunk("IHDR", ihdr(6000, 0)),
      ...chunk("IEND", []),
    ]);
    expect(() => onPageColour(twice, [0, 0, 0])).toThrow("more than one IHDR");
    const interlaced = new Uint8Array([...sig, ...chunk("IHDR", ihdr(1, 1)), ...chunk("IEND", [])]);
    expect(() => onPageColour(interlaced, [0, 0, 0])).toThrow("interlaced");
  });

  it("refuses a total over 3 MiB", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"];
    const many: GalleryTemplate[] = [
      { name: "a", title: "A", kind: "starter", description: "a", items },
    ];
    const map = new Map<string, Uint8Array>();
    items.forEach((item, index) => {
      map.set(`templates/${item}-light.png`, noisePng(300, 300, index * 2));
      map.set(`templates/${item}-dark.png`, noisePng(300, 300, index * 2 + 1));
    });
    expect(() => buildGallery(map, many, links)).toThrow(/total .* over the 3145728 byte budget/);
  });
});

describe("onPageColour", () => {
  it("shows the page colour through full transparency and keeps opaque pixels", () => {
    expect(pixel(onPageColour(png(1, 1, [200, 10, 10, 0]), [13, 17, 23]))).toEqual([
      13, 17, 23, 255,
    ]);
    expect(pixel(onPageColour(png(1, 1, [200, 10, 10, 255]), [13, 17, 23]))).toEqual([
      200, 10, 10, 255,
    ]);
  });

  it("rounds half transparency to the nearest integer", () => {
    // (255 * 128 + 0 * 127) / 255 = 128; (0 * 128 + 255 * 127) / 255 = 127
    expect(pixel(onPageColour(png(1, 1, [255, 0, 0, 128]), [0, 255, 0]))).toEqual([
      128, 127, 0, 255,
    ]);
  });

  it("refuses an oversize file and an oversize picture", () => {
    expect(() => onPageColour(new Uint8Array(512 * 1024 + 1), [0, 0, 0])).toThrow("byte limit");
    const header = Buffer.from(png(1, 1, [0, 0, 0, 255]));
    header.writeUInt32BE(5000, 16);
    expect(() => onPageColour(new Uint8Array(header), [0, 0, 0])).toThrow("4096 px side limit");
  });
});

describe("writeWiki", () => {
  const temp: string[] = [];
  afterEach(() => {
    for (const dir of temp.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("replaces the md files and gallery/ of the output folder and nothing else", () => {
    const out = mkdtempSync(join(tmpdir(), "wiki-"));
    temp.push(out);
    mkdirSync(join(out, "gallery"));
    writeFileSync(join(out, "gallery", "old.png"), "x");
    writeFileSync(join(out, "x.md"), "x");
    writeFileSync(join(out, "keep.txt"), "keep");
    const written = writeWiki(docsDir, out, options, goldenDir);
    expect(existsSync(join(out, "gallery", "old.png"))).toBe(false);
    expect(existsSync(join(out, "x.md"))).toBe(false);
    expect(readFileSync(join(out, "keep.txt"), "utf8")).toBe("keep");
    expect(existsSync(join(out, "Gallery.md"))).toBe(true);
    const files = written.filter((file) => file.startsWith("gallery/"));
    expect(files.length).toBeGreaterThan(0);
    expect(readdirSync(join(out, "gallery")).sort()).toEqual(
      files.map((file) => file.slice("gallery/".length)).sort(),
    );
  });
});
