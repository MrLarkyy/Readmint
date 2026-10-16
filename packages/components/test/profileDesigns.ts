import { applyDesignProps, parseDesign, type Design } from "@readmint/format";
import { renderSvg, type RenderLimits } from "@readmint/renderer";
import type { ProfileSection, ProfileTemplate } from "../src/index.js";
import { profileExampleProps } from "@readmint/examples/props";

export type ProfileTheme = "light" | "dark";

/** The design files as published, read as text in Node and in the browser alike, by path below `templates/profiles/`. */
const designSources = import.meta.glob(
  ["../templates/profiles/*/*.json", "!../templates/profiles/*/settings.json"],
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

/** The file name of a design: the dark twin is `<section>.dark.json`. */
export function profileFile(section: ProfileSection, theme: ProfileTheme): string {
  return theme === "dark" ? `${section}.dark.json` : `${section}.json`;
}

/** The text of a design file as published. */
export function profileSource(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme = "light",
): string {
  const path = `${prefix}${template}/${profileFile(section, theme)}`;
  const source = designSources[path];
  if (source === undefined) throw new Error(`no design file ${path}`);
  return source;
}

/** A fresh, validated copy of a section design; one that does not validate fails the test naming its issues. */
export function loadProfile(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme = "light",
): Design {
  const result = parseDesign(profileSource(template, section, theme));
  if (!result.ok)
    throw new Error(
      `${template}/${profileFile(section, theme)} does not validate: ${JSON.stringify(result.issues)}`,
    );
  return result.value;
}

/**
 * A section with the example's personal texts set as root props, as a user fills them in (the files ship empty
 * defaults). Sections without personal texts are returned as they are.
 */
export function loadExampleProfile(
  template: ProfileTemplate,
  section: ProfileSection,
  theme: ProfileTheme = "light",
): Design {
  const design = loadProfile(template, section, theme);
  const props = profileExampleProps[template]?.[section];
  if (props === undefined) return design;
  const result = applyDesignProps(design, props);
  if (!result.ok) {
    throw new Error(
      `${template}/${profileFile(section, theme)} takes no example props: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.value;
}

/** The font files of one template folder, by the relative `src` its designs give them. */
export function profileFontFiles(template: ProfileTemplate): Readonly<Record<string, Uint8Array>> {
  const folder = `${prefix}${template}/`;
  return Object.fromEntries(
    Object.entries(fontSources)
      .filter(([path]) => path.startsWith(folder))
      .map(([path, uri]) => [path.slice(folder.length), dataUriBytes(uri)]),
  );
}

/** The bytes of every font asset the design names, as the CLI and the Action supply them after reading the files. */
export function profileFontAssets(
  template: ProfileTemplate,
  design: Design,
): Record<string, Uint8Array> {
  const files = profileFontFiles(template);
  const assets: Record<string, Uint8Array> = {};
  for (const [id, font] of Object.entries(design.assets?.fonts ?? {})) {
    const bytes = files[font.src];
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
}

/** Renders a section; a failed render or a warning throws naming the issues. */
export function renderProfile({ template, design, data, limits, time }: ProfileRender): string {
  const result = renderSvg(design, {
    data,
    assets: { fonts: profileFontAssets(template, design) },
    ...(limits === undefined ? {} : { limits }),
    ...(time === undefined ? {} : { time }),
  });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  if (result.warnings.length > 0)
    throw new Error(`render warned: ${JSON.stringify(result.warnings)}`);
  return result.svg;
}
