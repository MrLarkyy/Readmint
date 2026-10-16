import type { GalleryTemplate } from "./GalleryTemplate.js";

/** Path of the golden PNG of one item, relative to packages/components/test/golden. */
export function galleryImagePath(
  template: GalleryTemplate,
  item: string,
  theme: "light" | "dark",
): string {
  return template.kind === "profile"
    ? `profiles-${template.name}/${item}-${theme}.png`
    : `templates/${item}-${theme}.png`;
}
