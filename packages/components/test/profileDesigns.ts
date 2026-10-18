import {
  applyDesignProps,
  applyRenderVariant,
  parseDesign,
  parseRenderManifest,
  renderVariant,
  type Design,
  type RenderManifestEntry,
} from "@readmint/format";
import { renderSvg, type RenderIssueCode, type RenderLimits } from "@readmint/renderer";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import { profileExampleProps } from "@readmint/examples/props";

export type ProfileTheme = "light" | "dark";

/** The design files as published, read as text in Node and in the browser alike, by path below `templates/profiles/`. */
const designSources = import.meta.glob(
  ["../templates/profiles/*/*.json", "!../templates/profiles/*/{settings,renders}.json"],
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
);

const fontSources = import.meta.glob("../templates/profiles/*/fonts/*.ttf", {
  eager: true,
  query: "?inline",
  import: "default",
});

const prefix = "../templates/profiles/";

function dataUriBytes(uri: string): Uint8Array {
  const binary = atob(uri.slice(uri.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const manifestSources = import.meta.glob("../templates/profiles/*/renders.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

const manifests = new Map<ProfileTemplate, readonly RenderManifestEntry[]>();

/** The renders of a template as its `renders.json` lists them, in README order. */
export function profileRenders(template: ProfileTemplate): readonly RenderManifestEntry[] {
  let renders = manifests.get(template);
  if (renders === undefined) {
    const path = `${prefix}${template}/renders.json`;
    const source = manifestSources[path];
    if (source === undefined) throw new Error(`no manifest ${path}`);
    const result = parseRenderManifest(source);
    if (!result.ok) throw new Error(`${path} does not validate: ${JSON.stringify(result.issues)}`);
    renders = result.value.renders;
    manifests.set(template, renders);
  }
  return renders;
}

/** The manifest entry of a section: the render named like it. */
export function profileRender(
  template: ProfileTemplate,
  section: ProfileSection,
): RenderManifestEntry {
  const entry = profileRenders(template).find((render) => render.name === section);
  if (entry === undefined) throw new Error(`${template}/renders.json has no render ${section}`);
  return entry;
}

/** The file name of the design a section renders (`repo.json` for the six repository cards). */
export function profileFile(template: ProfileTemplate, section: ProfileSection): string {
  return profileRender(template, section).design;
}

/** The text of the design file a section renders, as published. */
export function profileSource(template: ProfileTemplate, section: ProfileSection): string {
  const path = `${prefix}${template}/${profileFile(template, section)}`;
  const source = designSources[path];
  if (source === undefined) throw new Error(`no design file ${path}`);
  return source;
}

/**
 * A fresh, validated copy of a section design as the CLI and the Action render it: the design, the entry's props,
 * then the dark variant; one that does not validate fails the test naming its issues.
 */
export function loadProfile(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme = "light",
): Design {
  const entry = profileRender(template, section);
  const file = `${template}/${entry.design}`;
  const parsed = parseDesign(profileSource(template, section));
  if (!parsed.ok) throw new Error(`${file} does not validate: ${JSON.stringify(parsed.issues)}`);
  const withProps = applyDesignProps(parsed.value, entry.props);
  if (!withProps.ok)
    throw new Error(`${file} takes no props of ${section}: ${JSON.stringify(withProps.issues)}`);
  if (theme === "light") return withProps.value;
  const dark = renderVariant("dark");
  if (dark === undefined) throw new Error("no dark render variant");
  const variant = applyRenderVariant(withProps.value, dark);
  if (!variant.ok)
    throw new Error(`${file} takes no dark variant: ${JSON.stringify(variant.issues)}`);
  return variant.value;
}

/**
 * A section with the example's personal texts set as root props, as a user fills them in (the files ship empty
 * defaults). Sections without personal texts are returned as they are.
 */
export function loadExampleProfile(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme = "light",
  omit: readonly string[] = [],
): Design {
  const design = loadProfile(template, section, theme);
  const props = profileExampleProps[template]?.[section];
  if (props === undefined) return design;
  const kept = Object.fromEntries(Object.entries(props).filter(([name]) => !omit.includes(name)));
  const result = applyDesignProps(design, kept);
  if (!result.ok) {
    throw new Error(
      `${template}/${section} takes no example props: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.value;
}

/** Decoded font files by path: a template folder holds megabytes of fonts, and tests render thousands of times. */
const decodedFonts = new Map<string, Uint8Array>();

/** The bytes of a font file by its relative `src` in one template folder, decoded once; undefined when absent. */
function profileFontFile(template: ProfileTemplate, src: string): Uint8Array | undefined {
  const path = `${prefix}${template}/${src}`;
  const uri = fontSources[path];
  if (uri === undefined) return undefined;
  let bytes = decodedFonts.get(path);
  if (bytes === undefined) {
    bytes = dataUriBytes(uri);
    decodedFonts.set(path, bytes);
  }
  return bytes;
}

/** The font files of one template folder, by the relative `src` its designs give them (shared: never change them). */
export function profileFontFiles(template: ProfileTemplate): Readonly<Record<string, Uint8Array>> {
  const folder = `${prefix}${template}/`;
  return Object.fromEntries(
    Object.keys(fontSources)
      .filter((path) => path.startsWith(folder))
      .map((path) => {
        const src = path.slice(folder.length);
        return [src, profileFontFile(template, src) ?? new Uint8Array()];
      }),
  );
}

/**
 * The bytes of every font asset the design names, as the CLI and the Action supply them after reading the files
 * (shared: never change them).
 */
export function profileFontAssets(
  template: ProfileTemplate,
  design: Design,
): Record<string, Uint8Array> {
  const assets: Record<string, Uint8Array> = {};
  for (const [id, font] of Object.entries(design.assets?.fonts ?? {})) {
    const bytes = profileFontFile(template, font.src);
    if (bytes === undefined)
      throw new Error(`font asset ${id} names ${font.src}, not in ${template}/fonts`);
    assets[id] = bytes;
  }
  return assets;
}

export interface ProfileRender {
  readonly template: ProfileTemplate;
  readonly design: Design;
  readonly data: Readonly<Record<string, unknown>>;
  readonly limits?: Partial<RenderLimits>;
  /** A frame at this many milliseconds instead of the animated SVG. */
  readonly time?: number;
  /** The warning codes the render is expected to give: any other code fails it, and so does a missing one. */
  readonly expectWarnings?: readonly RenderIssueCode[];
}

/** Renders a section; a failed render, a warning not in `expectWarnings` or an expected one that is absent throws. */
export function renderProfile({
  template,
  design,
  data,
  limits,
  time,
  expectWarnings = [],
}: ProfileRender): string {
  const result = renderSvg(design, {
    data,
    assets: { fonts: profileFontAssets(template, design) },
    ...(limits === undefined ? {} : { limits }),
    ...(time === undefined ? {} : { time }),
  });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  const codes = new Set(result.warnings.map((warning) => warning.code));
  const unexpected = result.warnings.filter((warning) => !expectWarnings.includes(warning.code));
  if (unexpected.length > 0) throw new Error(`render warned: ${JSON.stringify(unexpected)}`);
  const absent = expectWarnings.filter((code) => !codes.has(code));
  if (absent.length > 0) throw new Error(`render did not warn: ${absent.join(", ")}`);
  return result.svg;
}
