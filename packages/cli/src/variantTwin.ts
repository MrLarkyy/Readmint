import { lstat } from "node:fs/promises";
import path from "node:path";
import type { RenderVariant } from "@readmint/format";

/**
 * The design file `<stem>.<variant><ext>` next to `design`, named as `design` is typed, when it exists: a real file
 * of the variant wins over rendering the variant from `design`. None when `design` already is such a file.
 */
export async function variantTwin(
  design: string,
  variant: RenderVariant,
  cwd: string,
): Promise<string | undefined> {
  const extension = path.extname(design);
  const stem = design.slice(0, design.length - extension.length);
  const suffix = `.${variant.name}`;
  if (stem.toLowerCase().endsWith(suffix)) return undefined;
  const twin = `${stem}${suffix}${extension}`;
  try {
    await lstat(path.resolve(cwd, twin));
    return twin;
  } catch {
    return undefined;
  }
}
