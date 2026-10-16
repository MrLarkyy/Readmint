import { createHash } from "node:crypto";
import { examplesRepository } from "./examplesRepository.js";
import type { GalleryTemplate } from "./GalleryTemplate.js";
import { galleryImagePath } from "./galleryImagePath.js";
import { onPageColour } from "./onPageColour.js";

const totalBudget = 3 * 1024 * 1024;
const fileBudget = 512 * 1024;
/** GitHub page colours (docs/components.md): a preview sits on the colour of its theme, so it reads on any wiki theme. */
const pageColour = { light: [255, 255, 255], dark: [13, 17, 23] } as const;

export interface GalleryLinks {
  /** Repository URL without a trailing slash. */
  readonly repository: string;
  readonly branch: string;
}

export interface Gallery {
  readonly page: string;
  /** Wiki file name (gallery/HASH.png) to PNG bytes. */
  readonly files: Map<string, Uint8Array>;
}

/**
 * Builds the Gallery page and its images from the golden PNGs (`images`: path relative to the golden folder to bytes).
 * Each image is flattened on its theme's page colour and named by the first 16 hex digits of its sha256, so identical
 * images are written once. Fails naming the file when a golden is missing or an image or the total is over budget.
 */
export function buildGallery(
  images: ReadonlyMap<string, Uint8Array>,
  templates: readonly GalleryTemplate[],
  links: GalleryLinks,
): Gallery {
  const files = new Map<string, Uint8Array>();
  const converted = new Map<string, string>();
  const imageLink = (template: GalleryTemplate, item: string, theme: "light" | "dark"): string => {
    const path = galleryImagePath(template, item, theme);
    let name = converted.get(path);
    if (name === undefined) {
      const source = images.get(path);
      if (source === undefined) throw new Error(`golden ${path} is missing`);
      const flat = flatten(path, source, theme);
      if (flat.byteLength > fileBudget) {
        throw new Error(
          `gallery image ${path} is ${String(flat.byteLength)} bytes, over the ${String(fileBudget)} byte budget`,
        );
      }
      name = `gallery/${createHash("sha256").update(flat).digest("hex").slice(0, 16)}.png`;
      files.set(name, flat);
      converted.set(path, name);
    }
    return `![${template.title}, ${item}, ${theme}](${name})`;
  };

  const lines = [
    "# Gallery",
    "",
    "> Generated from the golden images of the repository by the wiki generator. Edit the templates there; changes made on the wiki are overwritten.",
    "",
    "Every profile, starter and calendar template rendered from the sample data, in light and dark, each on the page colour of its theme.",
    "",
  ];
  for (const template of templates) {
    lines.push(
      `## ${template.title}`,
      "",
      template.description,
      "",
      templateLinks(template, links),
      "",
    );
    for (const theme of ["light", "dark"] as const) {
      lines.push(
        `**${theme === "light" ? "Light" : "Dark"}**`,
        "",
        ...template.items.map((item) => imageLink(template, item, theme)),
        "",
      );
    }
  }

  let total = 0;
  for (const bytes of files.values()) total += bytes.byteLength;
  if (total > totalBudget) {
    throw new Error(
      `gallery images total ${String(total)} bytes, over the ${String(totalBudget)} byte budget`,
    );
  }
  return { page: lines.join("\n"), files };
}

function flatten(path: string, source: Uint8Array, theme: "light" | "dark"): Uint8Array {
  try {
    return onPageColour(source, pageColour[theme]);
  } catch (error) {
    throw new Error(
      `gallery image ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function templateLinks(template: GalleryTemplate, links: GalleryLinks): string {
  if (template.kind === "profile") {
    return `[Template folder](${examplesRepository}/tree/HEAD/${template.name}) · [Components docs](Components-and-templates#profile-templates)`;
  }
  const design = `${links.repository}/blob/${links.branch}/packages/components/templates/${template.name}.design.json`;
  const anchor = template.kind === "calendar" ? "contribution-calendar" : "starter-templates";
  return `[Design file](${design}) · [Examples repository](${examplesRepository}) · [Components docs](Components-and-templates#${anchor})`;
}
