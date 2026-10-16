import { tokenSecrets } from "./githubToken.js";
import type { DataJsonSpec } from "./parseDataJsonArgs.js";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Every value standard error and the preview page must never show: the token variables, and the variables
 * `--data-json-header` names, each as set and trimmed.
 */
export function cliSecrets(env: Env, dataJson: readonly DataJsonSpec[] = []): string[] {
  const names = new Set(dataJson.flatMap((spec) => Object.values(spec.headers)));
  const headerValues = [...names].flatMap((name) => {
    const value = Object.hasOwn(env, name) ? env[name] : undefined;
    return value === undefined ? [] : [value, value.trim()];
  });
  return [...tokenSecrets(env), ...headerValues];
}
