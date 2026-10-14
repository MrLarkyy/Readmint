const dropped = /^(?:INPUT_|GIT_TRACE|GIT_CURL_VERBOSE$|GIT_AUTHOR_|GIT_COMMITTER_)/i;

/**
 * The environment git runs with: the process environment without the Action's inputs (the
 * token is one), without git's tracing switches (they print headers), without author and
 * committer overrides (the Action's commits carry `gitIdentity`) and without any variable whose
 * value holds a secret; prompts are switched off so a missing credential fails at once.
 */
export function gitEnv(
  env: Readonly<Record<string, string | undefined>>,
  secrets: readonly string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || dropped.test(name)) continue;
    if (secrets.some((secret) => secret.length >= 4 && value.includes(secret))) continue;
    result[name] = value;
  }
  result.GIT_TERMINAL_PROMPT = "0";
  result.GCM_INTERACTIVE = "never";
  return result;
}
