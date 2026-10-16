/**
 * The names a layer's `let` may bind: exactly the names an expression can read (a letter or `_`, then letters, digits
 * and `_`, a `-` only before a letter or `_`, so `x-1` stays a subtraction), at most `maxLength` characters, none of
 * `reserved`. Part of the public contract.
 */
export const LocalNames = Object.freeze({
  pattern: "^[A-Za-z_][A-Za-z0-9_]*(?:-[A-Za-z_][A-Za-z0-9_]*)*$",
  maxLength: 64,
  /** `props` is the component props local; the others are expression literals and could never be read back. */
  reserved: Object.freeze(["props", "true", "false", "null"] as const),
});

export type LocalNames = typeof LocalNames;
