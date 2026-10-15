import { parseDesign, type Design } from "@readmint/format";
import { renderSvg, type RenderLimits } from "@readmint/renderer";
import type { StarterTemplate } from "../src/index.js";
import banner from "../templates/banner.design.json?raw";
import extraBold from "../templates/fonts/Montserrat-ExtraBold.ttf?inline";
import medium from "../templates/fonts/Montserrat-Medium.ttf?inline";
import isometricCard from "../templates/isometric-card.design.json?raw";
import languageBars from "../templates/language-bars.design.json?raw";
import profileCard from "../templates/profile-card.design.json?raw";
import statsCard from "../templates/stats-card.design.json?raw";

/** The starter files as published, read as text in Node and in the browser alike. */
export const starterSources: Readonly<Record<StarterTemplate, string>> = {
  "stats-card": statsCard,
  "isometric-card": isometricCard,
  banner,
  "language-bars": languageBars,
  "profile-card": profileCard,
};

function dataUriBytes(uri: string): Uint8Array {
  const binary = atob(uri.slice(uri.indexOf(",") + 1));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** The font files of `templates/fonts/` by the relative `src` the templates give them. */
const fontFiles: Readonly<Record<string, Uint8Array>> = {
  "fonts/Montserrat-Medium.ttf": dataUriBytes(medium),
  "fonts/Montserrat-ExtraBold.ttf": dataUriBytes(extraBold),
};

/** A fresh, validated copy of a starter; one that does not validate fails the test naming its issues. */
export function loadStarter(name: StarterTemplate): Design {
  const result = parseDesign(starterSources[name]);
  if (!result.ok) throw new Error(`${name} does not validate: ${JSON.stringify(result.issues)}`);
  return result.value;
}

/** The props of the root instance replaced (the starters have one: the card). */
export function withRootProps(
  design: Design,
  props: Readonly<Record<string, string | number | boolean>>,
): Design {
  const [root, ...rest] = design.layers;
  if (root?.type !== "component") throw new Error("the template has no root instance");
  return { ...design, layers: [{ ...root, props: { ...root.props, ...props } }, ...rest] };
}

/** The bytes of every font asset the design names, as the CLI and the Action supply them after reading the files. */
export function fontAssets(design: Design): Record<string, Uint8Array> {
  const assets: Record<string, Uint8Array> = {};
  for (const [id, font] of Object.entries(design.assets?.fonts ?? {})) {
    const bytes = fontFiles[font.src];
    if (bytes === undefined)
      throw new Error(`font asset ${id} names ${font.src}, not in templates/fonts`);
    assets[id] = bytes;
  }
  return assets;
}

export interface TemplateRender {
  readonly design: Design;
  readonly data: Readonly<Record<string, unknown>>;
  readonly limits?: Partial<RenderLimits>;
}

/** Renders a starter; a failed render or a warning throws naming the issues. */
export function renderTemplate({ design, data, limits }: TemplateRender): string {
  const result = renderSvg(design, {
    data,
    assets: { fonts: fontAssets(design) },
    ...(limits === undefined ? {} : { limits }),
  });
  if (!result.ok) throw new Error(`render failed: ${JSON.stringify(result.issues)}`);
  if (result.warnings.length > 0)
    throw new Error(`render warned: ${JSON.stringify(result.warnings)}`);
  return result.svg;
}
