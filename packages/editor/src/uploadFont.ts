import type { FontAsset } from "@readmint/format";
import { encodeBase64 } from "./base64.js";
import { commitDesign, refuse } from "./commitDesign.js";
import { setAt } from "./designPointer.js";
import type { EditorState } from "./EditorState.js";
import { readFontFile } from "./readFontFile.js";
import { uniqueId } from "./layerAccess.js";

/** A font file the user picked. */
export interface FontFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** OS/2 fsSelection bit 0: the font is italic. */
const italicBit = 0x0001;

/**
 * Adds a font file to the design as a font asset whose `src` is a base64 data URI, so the design file carries it.
 * Family, weight and style come from the font (the file name when it names no family). A font whose OS/2 fsType
 * forbids embedding is stored with `embedding: "restricted"`, so it is drawn as paths and never embedded. Refused,
 * with the state unchanged: a file over `maxFontBytes` (before it is parsed), a malformed or unsupported font, and
 * one that would make the exported design longer than `DesignLimits.maxSourceLength` (what the CLI reads).
 */
export function uploadFont(state: EditorState, file: FontFile): EditorState {
  const name = JSON.stringify(file.name.slice(0, 128));
  const read = readFontFile(file.bytes);
  if (!read.ok) return refuse(state, "font", `font ${name} ${read.message}`);
  const { font, check } = read;
  const stem = file.name.replace(/\.[^.]*$/u, "");
  const fonts = state.design.assets?.fonts ?? {};
  const id = uniqueId(assetIdBase(stem), new Set(Object.keys(fonts)), "-");
  const family = (font.familyName === "" ? stem : font.familyName).slice(0, 128) || id;
  const os2 = font.table("OS/2");
  const fsSelection =
    os2 !== undefined && os2.length >= 64 ? ((os2[62] ?? 0) << 8) | (os2[63] ?? 0) : 0;
  const weight = font.weightClass;
  const asset: FontAsset = {
    family,
    src: `data:font/${font.container};base64,${encodeBase64(file.bytes)}`,
    ...(Number.isInteger(weight) && weight >= 1 && weight <= 1000 ? { weight } : {}),
    ...((fsSelection & italicBit) === 0 ? {} : { style: "italic" as const }),
    licence: { embedding: check.embeddable ? "allowed" : "restricted" },
  };
  const assets = { ...state.design.assets, fonts: { ...fonts, [id]: asset } };
  const candidate = setAt(state.design, "/assets", assets);
  if (candidate === undefined) return refuse(state, "font", `font ${name} could not be added`);
  return commitDesign(
    state,
    candidate,
    { fontChecks: { ...state.fontChecks, [id]: check } },
    "font",
  );
}

/** A valid asset id from a file name: letters, digits, `_` and `-`, starting with a letter. */
function assetIdBase(stem: string): string {
  const cleaned = stem.replace(/[^A-Za-z0-9_-]+/gu, "-").replace(/^[^A-Za-z]+/u, "");
  return (cleaned === "" ? "font" : cleaned).slice(0, 56);
}
