import { embeddingAllowed, parseSfnt, type SfntFont } from "@readmint/fonts";
import type { FontAsset } from "@readmint/format";
import { decodeDataUri } from "./decodeDataUri.js";
import { ownEntry } from "./ownEntry.js";
import { pointer } from "./pointer.js";
import type { RenderContext } from "./RenderContext.js";
import { echo } from "./resolveValue.js";

/** A font asset that passed every check; drawn with an embedded subset or as paths. */
export interface LoadedFont {
  readonly asset: string;
  readonly family: string;
  /** The declared weight (400 when the asset declares none); the weight the SVG asks for. */
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly font: SfntFont;
  /** `paths` when the asset asks for it or its licence forbids embedding: such a font is never embedded. */
  readonly drawAs: "font" | "paths";
  readonly kerning: boolean;
}

const defaultWeight = 400;
const maxFallbacks = 8;

/**
 * The font a text draws with: among the assets sharing the family of `assetId` and its style (or `style`), the one
 * whose weight CSS font matching would pick for `weight` (the asset itself when no weight is asked for or no asset
 * has that style). Only that asset is loaded.
 */
export function selectFont(
  context: RenderContext,
  assetId: string,
  weight: number | undefined,
  usePath: string,
  style?: "normal" | "italic",
): LoadedFont {
  const fonts = context.design.assets?.fonts;
  const asset = ownEntry(fonts, assetId);
  if (asset === undefined) context.fail(usePath, "missing-asset", `no font asset ${echo(assetId)}`);
  if (weight === undefined || fonts === undefined) return loadFont(context, assetId, asset);
  const wanted = style ?? asset.style ?? "normal";
  const candidates = Object.keys(fonts)
    .flatMap((id) => {
      const other = ownEntry(fonts, id);
      return other !== undefined &&
        other.family === asset.family &&
        (other.style ?? "normal") === wanted
        ? [{ id, weight: other.weight ?? defaultWeight }]
        : [];
    })
    .sort((left, right) => left.weight - right.weight || compare(left.id, right.id));
  const chosenWeight = matchWeight(
    weight,
    candidates.map((candidate) => candidate.weight),
  );
  const sameWeight = candidates.filter((candidate) => candidate.weight === chosenWeight);
  const chosen = sameWeight.find((candidate) => candidate.id === assetId) ?? sameWeight[0];
  const chosenId = chosen?.id ?? assetId;
  return loadFont(context, chosenId, ownEntry(fonts, chosenId) ?? asset);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** CSS Fonts 4 weight matching over the available weights (sorted ascending). */
export function matchWeight(desired: number, available: readonly number[]): number {
  if (available.includes(desired)) return desired;
  const above = available.filter((weight) => weight > desired);
  const below = available.filter((weight) => weight < desired).reverse();
  if (desired >= 400 && desired <= 500) {
    const upTo500 = above.filter((weight) => weight <= 500);
    return upTo500[0] ?? below[0] ?? above[0] ?? desired;
  }
  if (desired < 400) return below[0] ?? above[0] ?? desired;
  return above[0] ?? below[0] ?? desired;
}

/**
 * Checks one font asset (size, format, licence, fsType) once per render. A font whose declared licence or OS/2
 * fsType forbids embedding is drawn as paths, with one `font-not-embeddable` warning; nothing is embedded here
 * (the subsets are written once every text is laid out).
 */
export function loadFont(context: RenderContext, assetId: string, asset: FontAsset): LoadedFont {
  const cached = context.fonts.get(assetId);
  if (cached !== undefined) return cached;
  const assetPath = pointer("/assets/fonts", assetId);
  const name = echo(assetId);
  const { bytes, mime } = fontBytes(context, assetId, asset, assetPath);
  const parsed = parseSfnt(bytes, { maxBytes: context.limits.maxFontBytes });
  if (!parsed.ok) {
    context.fail(
      parsed.kind === "too-large" ? assetPath : pointer(assetPath, "src"),
      parsed.kind === "unsupported"
        ? "unsupported-font"
        : parsed.kind === "too-large"
          ? "asset-too-large"
          : "asset-format",
      `font asset ${name}: ${parsed.message}`,
    );
  }
  const font = parsed.font;
  if (mime !== undefined && mime !== `font/${font.container}`) {
    context.fail(
      pointer(assetPath, "src"),
      "asset-format",
      `font asset ${name} is declared ${mime} but holds a ${font.container.toUpperCase()} font`,
    );
  }
  if (font.familyName !== asset.family) {
    context.warn(
      pointer(assetPath, "family"),
      "font-family-mismatch",
      `font asset ${name} declares family ${echo(asset.family)} but the font names itself ${echo(font.familyName)}; rasterizers match the name inside the font`,
    );
  }
  const loaded: LoadedFont = {
    asset: assetId,
    family: asset.family,
    weight: asset.weight ?? defaultWeight,
    style: asset.style ?? "normal",
    font,
    drawAs: drawAs(context, asset, font, assetPath, name),
    kerning: asset.kerning !== false,
  };
  context.fonts.set(assetId, loaded);
  return loaded;
}

/** Fallback ids of a font asset; the schema allows 1 to 8, an unvalidated design gets the same bound. */
export function fontFallbacks(asset: FontAsset | undefined): readonly string[] {
  const fallback: unknown = asset?.fallback;
  if (!Array.isArray(fallback)) return [];
  return fallback.filter((id): id is string => typeof id === "string").slice(0, maxFallbacks);
}

function drawAs(
  context: RenderContext,
  asset: FontAsset,
  font: SfntFont,
  assetPath: string,
  name: string,
): "font" | "paths" {
  if (asset.licence.embedding !== "allowed") {
    context.warn(
      pointer(pointer(assetPath, "licence"), "embedding"),
      "font-not-embeddable",
      `font asset ${name} is declared restricted: its text is drawn as paths, the font is never embedded`,
    );
    return "paths";
  }
  if (!embeddingAllowed(font.fsType)) {
    context.warn(
      assetPath,
      "font-not-embeddable",
      `font asset ${name} forbids embedding in its OS/2 fsType (0x${font.fsType.toString(16).padStart(4, "0")}): its text is drawn as paths, the font is never embedded`,
    );
    return "paths";
  }
  return asset.drawAs === "paths" ? "paths" : "font";
}

function fontBytes(
  context: RenderContext,
  assetId: string,
  asset: FontAsset,
  assetPath: string,
): { bytes: Uint8Array; mime: string | undefined } {
  const max = context.limits.maxFontBytes;
  const name = echo(assetId);
  const supplied = ownEntry(context.assets.fonts, assetId);
  if (supplied instanceof Uint8Array) {
    if (supplied.length > max) {
      context.fail(
        assetPath,
        "asset-too-large",
        `font asset ${name} holds ${String(supplied.length)} bytes, more than the ${String(max)} allowed`,
      );
    }
    return { bytes: supplied, mime: undefined };
  }
  if (!asset.src.startsWith("data:")) {
    context.fail(
      pointer(assetPath, "src"),
      "missing-asset",
      `font asset ${name}: no bytes were supplied for ${echo(asset.src)}`,
    );
  }
  const decoded = decodeDataUri(asset.src, max);
  if (!decoded.ok) {
    context.fail(
      pointer(assetPath, "src"),
      decoded.problem === "too-large" ? "asset-too-large" : "asset-format",
      `font asset ${name}: ${decoded.message}`,
    );
  }
  return { bytes: decoded.bytes, mime: decoded.mime };
}
