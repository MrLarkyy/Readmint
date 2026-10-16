import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { galleryImagePath, galleryTemplates } from "../src/index.js";

export const goldenDir = fileURLToPath(new URL("../../components/test/golden/", import.meta.url));

/** Every golden PNG the gallery list names that exists, by path relative to the golden folder. */
export function readGoldenImages(): Map<string, Uint8Array> {
  const images = new Map<string, Uint8Array>();
  for (const template of galleryTemplates) {
    for (const item of template.items) {
      for (const theme of ["light", "dark"] as const) {
        const path = galleryImagePath(template, item, theme);
        if (existsSync(goldenDir + path)) images.set(path, readFileSync(goldenDir + path));
      }
    }
  }
  return images;
}
