import { randomBytes } from "node:crypto";
import { appendFile } from "node:fs/promises";
import type { ActionOutputName } from "./ActionOutputs.js";

/** The values of one run's outputs. */
export type ActionOutputValues = Readonly<Record<ActionOutputName, string>>;

/**
 * Appends the outputs to the runner's `GITHUB_OUTPUT` file as `name<<delimiter` blocks. The
 * delimiter is `readmint_` and random hex, drawn again while any value contains it, so a value
 * cannot end its block early and forge another output. Values are passed through `redact` first.
 */
export async function writeActionOutputs(
  file: string,
  values: ActionOutputValues,
  redact: (text: string) => string,
  randomHex: () => string = () => randomBytes(16).toString("hex"),
): Promise<void> {
  const entries = Object.entries(values).map(([name, value]) => [name, redact(value)] as const);
  let delimiter: string;
  do {
    delimiter = `readmint_${randomHex()}`;
  } while (entries.some(([, value]) => value.includes(delimiter)));
  const text = entries
    .map(([name, value]) => `${name}<<${delimiter}\n${value}\n${delimiter}\n`)
    .join("");
  await appendFile(file, text, "utf8");
}
