import { escapeForLog, redactSecrets } from "@readmint/cli";

/**
 * The only way the Action prints. Every line is redacted (`redactSecrets`), escaped
 * (`escapeForLog`: no control or format character, so one line stays one line), then made inert
 * for the runner: `%` is encoded as the runner decodes command messages, and text that would
 * start a workflow command (`::` at the start, `##[` anywhere) is escaped. Workflow commands are
 * only ever the ones this class writes.
 */
export class ActionLog {
  readonly #write: (text: string) => void;
  readonly #secrets: string[];

  constructor(write: (text: string) => void, secrets: readonly string[]) {
    this.#write = write;
    this.#secrets = [...secrets];
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

  /**
   * Asks the runner to mask `secret` in every later log line, its own steps' too, and adds it to
   * this log's redaction. Each line of a multi-line value is masked on its own, as the runner
   * matches line by line.
   */
  mask(secret: string): void {
    for (const line of secret.split(/\r?\n|\r/)) {
      const value = line.trim();
      if (value === "") continue;
      this.#write(`::add-mask::${encodeMessage(value)}\n`);
      if (!this.#secrets.includes(value)) this.#secrets.push(value);
    }
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
