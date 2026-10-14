/**
 * The system error code of a Node filesystem error ("ENOENT", or "UNKNOWN" on Windows), without
 * its message (it embeds paths). Node's own `ERR_*` codes are programming errors, not included.
 */
export function errnoCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" && /^(?!ERR_)[A-Z][A-Z0-9_]*$/.test(code) ? code : undefined;
}
