/** The errno code of a Node filesystem error ("ENOENT"), without its message (it embeds paths). */
export function errnoCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const { code } = error;
  return typeof code === "string" && /^E[A-Z0-9]+$/.test(code) ? code : undefined;
}
