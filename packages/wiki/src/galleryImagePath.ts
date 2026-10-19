import type { GalleryTemplate } from "./GalleryTemplate.js";

/** Path of the golden PNG of one item, relative to packages/components/test/golden. */
export function galleryImagePath(
  template: GalleryTemplate,
  item: string,
  theme: "light" | "dark",
): string {
  if (template.kind === "profile") return `profiles-${template.name}/${item}-${theme}.png`;
  if (template.kind === "source") {
    if (template.folder === undefined) {
      throw new Error(`source card ${template.name} has no golden folder`);
    }
    return `${template.folder}/${item}-${theme}.png`;
  }
  if (template.kind === "calendar") {
    return theme === "light" ? `calendar/${item}.png` : `calendar/${item}-dark.png`;
  }
  return `templates/${item}-${theme}.png`;
}
