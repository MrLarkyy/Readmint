import { quoteAssetSource } from "./quoteAssetSource.js";

/** Why an asset source was refused; stable, meant for programs (the message is for people). */
export type AssetPathErrorCode =
  | "empty"
  | "too-long"
  | "absolute"
  | "invalid-character"
  | "parent-segment"
  | "trailing-dot-or-space"
  | "device-name"
  | "outside"
  | "not-found"
  | "not-a-file"
  | "unreadable"
  | "too-large"
  | "changed";

const reasons: Record<AssetPathErrorCode, (detail: string | undefined) => string> = {
  empty: () => "is empty",
  "too-long": () => "is longer than 1024 characters",
  absolute: () => "is absolute; asset paths are relative to the design folder",
  "invalid-character": () => "contains a character that is not allowed in an asset path",
  "parent-segment": () => 'contains a ".." segment',
  "trailing-dot-or-space": () => "has a path segment that ends in a dot or a space",
  "device-name": (device) => `names the Windows device ${device ?? "name"}`,
  outside: () => "resolves outside the design folder",
  "not-found": () => "does not exist in the design folder",
  "not-a-file": () => "is not a regular file",
  unreadable: (errno) => `cannot be read${errno === undefined ? "" : ` (${errno})`}`,
  "too-large": (maxBytes) => `is larger than ${maxBytes ?? "the limit of"} bytes`,
  changed: () => "changed while it was being read",
};

/**
 * An asset source the CLI or the Action refuses to load. The message quotes only the source as
 * written in the design, never an absolute path or Node error text (both can reach Action logs).
 */
export class AssetPathError extends Error {
  override readonly name = "AssetPathError";
  readonly code: AssetPathErrorCode;
  readonly src: string;

  /** `detail`: the device for device-name, the errno code for unreadable, the limit for too-large. */
  constructor(code: AssetPathErrorCode, src: string, detail?: string) {
    super(`asset ${quoteAssetSource(src)} ${reasons[code](detail)}`);
    this.code = code;
    this.src = src;
  }
}
