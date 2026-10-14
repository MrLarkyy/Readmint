import type { FontFormat } from "./FontFormat.js";

/** The container format named by the first four bytes, or undefined when they name none. */
export function sniffFontFormat(bytes: Uint8Array): FontFormat | undefined {
  if (bytes.length < 4) return undefined;
  const tag = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  switch (tag) {
    case "\u0000\u0001\u0000\u0000":
    case "true":
      return "ttf";
    case "OTTO":
      return "otf";
    case "wOFF":
      return "woff";
    case "wOF2":
      return "woff2";
    case "ttcf":
      return "ttc";
    default:
      return undefined;
  }
}
