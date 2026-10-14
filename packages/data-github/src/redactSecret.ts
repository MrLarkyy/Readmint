const TOKEN_PATTERN = /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]*/g;

/** Replaces the given secret and anything shaped like a GitHub token with `***`. */
export function redactSecret(text: string, secret?: string): string {
  const withoutSecret = secret ? text.split(secret).join("***") : text;
  return withoutSecret.replace(TOKEN_PATTERN, "***");
}
