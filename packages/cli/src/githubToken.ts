type Env = Readonly<Record<string, string | undefined>>;

const tokenVariables = ["GH_TOKEN", "GITHUB_TOKEN"] as const;

/** The token `--github` sends: the first of `GH_TOKEN`, `GITHUB_TOKEN` that is not empty, trimmed. */
export function githubToken(env: Env): string | undefined {
  for (const name of tokenVariables) {
    const value = env[name]?.trim();
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/** Every form of the token variables standard error must never show: each value as set and trimmed. */
export function tokenSecrets(env: Env): string[] {
  return tokenVariables.flatMap((name) => {
    const value = env[name];
    return value === undefined ? [] : [value, value.trim()];
  });
}
