import { embeddingAllowed, parseSfnt, type SfntFont } from "@readmint/fonts";
import type { FontAsset } from "@readmint/format";
import { bytesKey, sameBytes } from "./bytesKey.js";
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
  /**
   * `paths` when the asset asks for it, its licence forbids embedding or it has a Reserved Font Name: such a font is
   * never embedded.
   */
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
 * Checks one font asset (size, format, licence, fsType, Reserved Font Name) once per render. A font whose declared
 * licence or OS/2 fsType forbids embedding is drawn as paths, with one `font-not-embeddable` warning; a font with a
 * Reserved Font Name (declared, or stated in its name table) likewise, with one `font-reserved-name` warning unless
 * the asset asks for paths anyway. Nothing is embedded here (the subsets are written once every text is laid out).
 */
export function loadFont(context: RenderContext, assetId: string, asset: FontAsset): LoadedFont {
  const cached = context.fonts.get(assetId);
  if (cached !== undefined) return cached;
  const assetPath = pointer("/assets/fonts", assetId);
  const name = echo(assetId);
  const { font, mime } = readFontOnce(context, assetId, asset, assetPath);
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

/**
 * The parsed font of an asset's source, read once per render per source (supplied bytes also by content). A new source is charged against
 * `maxTotalFontBytes` before it decodes (its declared size: the parse may decode at most what is left) and by what it
 * decoded to; the asset that crosses the allowance fails with `asset-too-large`, in the same order on every run.
 */
function readFontOnce(
  context: RenderContext,
  assetId: string,
  asset: FontAsset,
  assetPath: string,
): { font: SfntFont; mime: string | undefined } {
  const supplied = ownEntry(context.assets.fonts, assetId);
  const key = supplied instanceof Uint8Array ? supplied : asset.src;
  const known = context.parsedFonts.get(key);
  if (known !== undefined) return known;
  const name = echo(assetId);
  // Size first (fontBytes refuses bytes over maxFontBytes), then the content key: nothing oversize is hashed.
  const { bytes, mime } = fontBytes(context, assetId, asset, assetPath);
  const contentKey = supplied instanceof Uint8Array ? bytesKey(bytes) : undefined;
  const sameContent = contentKey === undefined ? undefined : context.fontsByContent.get(contentKey);
  if (sameContent !== undefined && sameBytes(sameContent.bytes, bytes)) {
    context.parsedFonts.set(key, sameContent.read);
    return sameContent.read;
  }
  const left = context.fontBytesLeft;
  const total = () =>
    context.fail(
      assetPath,
      "asset-too-large",
      `font asset ${name} brings the fonts of this render past ${String(context.limits.maxTotalFontBytes)} decoded bytes together (maxTotalFontBytes); assets with the same source count once`,
    );
  if (bytes.length > left) total();
  const parsed = parseSfnt(bytes, { maxBytes: Math.min(context.limits.maxFontBytes, left) });
  if (!parsed.ok) {
    if (parsed.kind === "too-large" && left < context.limits.maxFontBytes) total();
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
  if (parsed.font.sfntBytes > left) total();
  context.fontBytesLeft = left - parsed.font.sfntBytes;
  const read = { font: parsed.font, mime };
  context.parsedFonts.set(key, read);
  // One entry per key: a font whose key collides with another's is decoded and charged on its own, so crafted
  // collisions cost one comparison each, never a scan.
  if (contentKey !== undefined && sameContent === undefined) {
    context.fontsByContent.set(contentKey, { bytes, read });
  }
  return read;
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
  if (asset.drawAs === "paths") return "paths";
  const reserved = reservedFontName(asset, font, assetPath);
  if (reserved === undefined) return "font";
  context.warn(
    reserved.path,
    "font-reserved-name",
    `font asset ${name} ${reserved.reason}: its text is drawn as paths, the font is never embedded (a subset is a Modified Version, which may not use a Reserved Font Name)`,
  );
  return "paths";
}

const rfnLicences = new Set(["OFL-1.0-RFN", "OFL-1.1-RFN"]);
const noRfnLicences = new Set(["OFL-1.0-NO-RFN", "OFL-1.1-NO-RFN"]);

/**
 * Whether the font has a Reserved Font Name, and what decided it: the asset's `licence.reservedFontName`, else its
 * SPDX `licence.name` (`OFL-*-RFN`, `OFL-*-no-RFN`), else the font's name table. SPDX identifiers compare without
 * ASCII case.
 */
function reservedFontName(
  asset: FontAsset,
  font: SfntFont,
  assetPath: string,
): { readonly path: string; readonly reason: string } | undefined {
  const licencePath = pointer(assetPath, "licence");
  const declared: unknown = asset.licence.reservedFontName;
  if (typeof declared === "boolean") {
    return declared
      ? { path: pointer(licencePath, "reservedFontName"), reason: "declares a Reserved Font Name" }
      : undefined;
  }
  const licence: unknown = asset.licence.name;
  const spdx = typeof licence === "string" ? asciiUpper(licence) : "";
  if (rfnLicences.has(spdx)) {
    return { path: pointer(licencePath, "name"), reason: `is licensed ${echo(licence)}` };
  }
  if (noRfnLicences.has(spdx)) return undefined;
  return font.reservedFontName
    ? { path: assetPath, reason: "states a Reserved Font Name in its name table" }
    : undefined;
}

function asciiUpper(text: string): string {
  return text.replace(/[a-z]/gu, (char) => String.fromCharCode(char.charCodeAt(0) - 0x20));
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
