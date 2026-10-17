import { lstat } from "node:fs/promises";
import path from "node:path";
import type { RenderVariant } from "@readmint/format";

/**
 * The design file `<stem>.<variant><ext>` next to `design`, when it exists: a real file of the variant wins over
 * rendering the variant from `design`. None when `design` already is such a file.
 */
export async function variantTwin(
  design: string,
  variant: RenderVariant,
  cwd: string,
): Promise<string | undefined> {
  const file = path.resolve(cwd, design);
  const extension = path.extname(file);
  const stem = file.slice(0, file.length - extension.length);
  const suffix = `.${variant.name}`;
  if (stem.toLowerCase().endsWith(suffix)) return undefined;
  const twin = `${stem}${suffix}${extension}`;
  try {
    await lstat(twin);
    return twin;
  } catch {
    return undefined;
  }
}
