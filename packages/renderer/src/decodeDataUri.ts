import { decodeBase64, decodedBase64Length } from "./base64.js";

export type DataUriResult =
  | { readonly ok: true; readonly mime: string; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly problem: "format" | "too-large"; readonly message: string };

const pattern = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/u;

/** Only `data:<mime>;base64,`; the decoded size is checked against `maxBytes` before anything is decoded. */
export function decodeDataUri(uri: string, maxBytes: number): DataUriResult {
  const match = pattern.exec(uri);
  if (match === null) {
    return { ok: false, problem: "format", message: "not a base64 data URI" };
  }
  const payload = uri.slice(match[0].length);
  const length = decodedBase64Length(payload);
  if (length !== undefined && length > maxBytes) {
    return {
      ok: false,
      problem: "too-large",
      message: `the data URI holds ${String(length)} bytes, more than the ${String(maxBytes)} allowed`,
    };
  }
  const bytes = decodeBase64(payload);
  if (bytes === undefined) return { ok: false, problem: "format", message: "invalid base64 data" };
  return { ok: true, mime: match[1] ?? "", bytes };
}
