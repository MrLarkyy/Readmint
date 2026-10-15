import { escapeForLog } from "@readmint/cli";
import { redactSecrets } from "./redactSecrets.js";

/**
 * The only way the Action prints. Every line is redacted (`redactSecrets`), escaped
 * (`escapeForLog`: no control or format character, so one line stays one line), then made inert
 * for the runner: `%` is encoded as the runner decodes command messages, and text that would
 * start a workflow command (`::` at the start, `##[` anywhere) is escaped. Workflow commands are
 * only ever the ones this class writes.
 */
export class ActionLog {
  readonly #write: (text: string) => void;
  readonly #secrets: readonly string[];

  constructor(write: (text: string) => void, secrets: readonly string[]) {
    this.#write = write;
    this.#secrets = secrets;
  }

  info(line: string): void {
    this.#write(`${inert(this.#clean(line))}\n`);
  }

  warning(line: string): void {
    this.#write(`::warning::${encodeMessage(this.#clean(line))}\n`);
  }

  error(line: string): void {
    this.#write(`::error::${encodeMessage(this.#clean(line))}\n`);
  }

  group(title: string, lines: readonly string[]): void {
    const body = lines.map((line) => `${inert(this.#clean(line))}\n`).join("");
    this.#write(`::group::${encodeMessage(this.#clean(title))}\n${body}::endgroup::\n`);
  }

  /** `text` without the secrets, as it may be written anywhere outside the log. */
  redact(text: string): string {
    return redactSecrets(text, this.#secrets);
  }

  #clean(line: string): string {
    return this.redact(escapeForLog(this.redact(line)));
  }
}

function encodeMessage(text: string): string {
  return text.replaceAll("%", "%25");
}

function inert(text: string): string {
  return text.replace(/^(\s*):/, "$1\\u003a").replaceAll("##[", "\\u0023#[");
}
