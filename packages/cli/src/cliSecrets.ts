import { wakaTimeSecretForms } from "@readmint/data-wakatime";
import { tokenSecrets } from "./githubToken.js";
import type { DataJsonSpec } from "./parseDataJsonArgs.js";
import type { DataWakaTimeSpec } from "./parseDataWakaTimeArgs.js";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Every value standard error and the preview page must never show: the token variables, the variables
 * `--data-json-header` names, each as set and trimmed, and the WakaTime keys of the variables `--data-wakatime` names in
 * every form they are sent in (`wakaTimeSecretForms`).
 */
export function cliSecrets(
  env: Env,
  dataJson: readonly DataJsonSpec[] = [],
  dataWakaTime: readonly DataWakaTimeSpec[] = [],
): string[] {
  const value = (name: string) => (Object.hasOwn(env, name) ? env[name] : undefined);
  const names = new Set(dataJson.flatMap((spec) => Object.values(spec.headers)));
  const headerValues = [...names].flatMap((name) => {
    const set = value(name);
    return set === undefined ? [] : [set, set.trim()];
  });
  const keys = [...new Set(dataWakaTime.map((spec) => spec.variable))].flatMap((name) => {
    const set = value(name);
    return set === undefined ? [] : wakaTimeSecretForms(set);
  });
  return [...tokenSecrets(env), ...headerValues, ...keys];
}
