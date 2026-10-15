import type { FontAsset, Layer } from "@readmint/format";
import type { GoldenFixture } from "@readmint/golden";
import type { RenderFixture } from "./renderFixture.js";

/** A golden fixture drawn twice: with embedded subsets (`<name>-font`) and as paths (`<name>-paths`). */
export interface FontPair {
  readonly name: string;
  readonly fonts: Readonly<Record<string, FontAsset>>;
  readonly layers: readonly Layer[];
  readonly height?: number;
  /** Only the paths fixture (a restricted font has no font variant). */
  readonly pathsOnly?: boolean;
}

/** Both fixtures of every pair; the paths one sets `drawAs: "paths"` on every font. */
export function pairFixtures(pairs: readonly FontPair[]): GoldenFixture<RenderFixture>[] {
  return pairs.flatMap((pair) => {
    const fixture = (
      suffix: string,
      fonts: Readonly<Record<string, FontAsset>>,
    ): GoldenFixture<RenderFixture> => ({
      name: `${pair.name}-${suffix}`,
      scale: 2,
      input: {
        design: {
          version: 0,
          canvas: { width: 240, height: pair.height ?? 60, background: "#ffffff" },
          assets: { fonts },
          layers: [...pair.layers],
        },
      },
    });
    const paths = Object.fromEntries(
      Object.entries(pair.fonts).map(([id, asset]) => [id, { ...asset, drawAs: "paths" as const }]),
    );
    return pair.pathsOnly === true
      ? [fixture("paths", pair.fonts)]
      : [fixture("font", pair.fonts), fixture("paths", paths)];
  });
}

/** Names of the pairs whose font and paths goldens must look alike. */
export function pairNames(pairs: readonly FontPair[]): string[] {
  return pairs.filter((pair) => pair.pathsOnly !== true).map((pair) => pair.name);
}

/** A copy of a base64 font data URI with its OS/2 fsType set: works in Node and in the browser. */
export function withFsType(dataUri: string, fsType: number): string {
  const [head = "", base64 = ""] = dataUri.split(",");
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + index * 16;
    if (String.fromCharCode(...bytes.subarray(record, record + 4)) === "OS/2") {
      view.setUint16(view.getUint32(record + 8) + 8, fsType);
    }
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${head},${btoa(binary)}`;
}
