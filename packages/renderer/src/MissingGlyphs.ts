import { pointer } from "./pointer.js";
import type { RenderIssue } from "./RenderIssue.js";
import { echo } from "./resolveValue.js";

interface Missing {
  readonly path: string;
  readonly codePoints: Set<number>;
}

const listed = 10;

/** Characters no font of a text covers, collected per primary font asset in first-use order. */
export class MissingGlyphs {
  private readonly byAsset = new Map<string, Missing>();

  note(asset: string, codePoint: number, path: string): void {
    let missing = this.byAsset.get(asset);
    if (missing === undefined) {
      missing = { path, codePoints: new Set() };
      this.byAsset.set(asset, missing);
    }
    missing.codePoints.add(codePoint);
  }

  /** One `missing-glyph` warning per primary font asset, naming at most ten characters. */
  warnings(): RenderIssue[] {
    return [...this.byAsset].map(([asset, { path, codePoints }]) => {
      const names = [...codePoints].slice(0, listed).map(codePointName).join(", ");
      const more = codePoints.size > listed ? ` and ${String(codePoints.size - listed)} more` : "";
      return {
        path: pointer("/assets/fonts", asset),
        code: "missing-glyph",
        message: `font asset ${echo(asset)} and its fallbacks have no glyph for ${names}${more} (first at ${path}); these characters are not drawn and keep the width of .notdef`,
      };
    });
  }
}

function codePointName(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}
