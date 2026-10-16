import { isCalendarDate } from "./calendarDate.js";
import { GitHubDataError } from "./GitHubDataError.js";
import { GitHubLimits } from "./GitHubSourceOptions.js";
import { isJsonRecord, ownField, type JsonRecord } from "./jsonRecord.js";

const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/;
const COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Typed access to an untrusted JSON value with the path it came from. Every accessor checks the
 * type and range and throws `invalid-response` naming the path, never echoing the value.
 */
export class ResponseReader {
  private constructor(
    private readonly value: unknown,
    readonly path: string,
  ) {}

  static of(value: unknown, path: string): ResponseReader {
    return new ResponseReader(value, path);
  }

  field(name: string): ResponseReader {
    return new ResponseReader(ownField(this.record(), name), `${this.path}.${name}`);
  }

  /** `null` for a JSON null; a missing field is still a malformed response. */
  nullable(): this | null {
    if (this.value === null) return null;
    if (this.value === undefined) this.fail("a value");
    return this;
  }

  /** Fails unless the value is an object. */
  object(): this {
    this.record();
    return this;
  }

  /** True when the value is an object with an own field of that name. */
  hasField(name: string): boolean {
    return isJsonRecord(this.value) && ownField(this.value, name) !== undefined;
  }

  items(max: number): ResponseReader[] {
    if (!Array.isArray(this.value)) this.fail("an array");
    const items: readonly unknown[] = this.value;
    if (items.length > max) this.fail(`at most ${String(max)} items`);
    return items.map((item, index) => new ResponseReader(item, `${this.path}[${String(index)}]`));
  }

  string(): string {
    if (typeof this.value !== "string") this.fail("a string");
    if (this.value.length > GitHubLimits.maxStringLength) {
      this.fail(`at most ${String(GitHubLimits.maxStringLength)} characters`);
    }
    return this.value;
  }

  /**
   * A string of any length, cut to the limit on a code point boundary: for free text such as a
   * commit message, where a long value is data, not a broken response.
   */
  clippedString(): string {
    if (typeof this.value !== "string") this.fail("a string");
    const limit = GitHubLimits.maxStringLength;
    if (this.value.length <= limit) return this.value;
    const lastUnit = this.value.charCodeAt(limit - 1);
    const cut = lastUnit >= 0xd800 && lastUnit <= 0xdbff ? limit - 1 : limit;
    return this.value.slice(0, cut);
  }

  nullableString(): string | null {
    return this.nullable()?.string() ?? null;
  }

  /** A non-negative safe integer. */
  count(): number {
    if (typeof this.value !== "number" || !Number.isSafeInteger(this.value) || this.value < 0) {
      this.fail("a non-negative integer");
    }
    return this.value;
  }

  boolean(): boolean {
    if (typeof this.value !== "boolean") this.fail("a boolean");
    return this.value;
  }

  date(): string {
    const text = this.string();
    if (!isCalendarDate(text)) this.fail("a YYYY-MM-DD date");
    return text;
  }

  timestamp(): string {
    const text = this.string();
    const match = TIMESTAMP_PATTERN.exec(text);
    if (!match?.[1] || !isCalendarDate(match[1])) this.fail("an ISO 8601 UTC timestamp");
    return text;
  }

  nullableTimestamp(): string | null {
    return this.nullable()?.timestamp() ?? null;
  }

  /** A GitHub-generated link: anything but an absolute https URL is a malformed response. */
  httpsUrl(): string {
    const text = this.string();
    if (!isHttpsUrl(text)) this.fail("an https URL");
    return text;
  }

  /** A link the user typed (website, homepage): kept only when it is an absolute https URL. */
  userUrl(): string | null {
    const text = this.nullableString();
    return text !== null && isHttpsUrl(text) ? text : null;
  }

  /** `#rrggbb`; any other string becomes `null` so it cannot break out of an SVG attribute. */
  colour(): string | null {
    const text = this.nullableString();
    return text !== null && COLOUR_PATTERN.test(text) ? text : null;
  }

  oneOf<T>(values: ReadonlyMap<string, T>): T {
    const text = this.string();
    const value = values.get(text);
    if (value === undefined) this.fail(`one of ${[...values.keys()].join(", ")}`);
    return value;
  }

  fail(expected: string): never {
    throw new GitHubDataError(
      "invalid-response",
      `Unexpected GitHub response at ${this.path}: expected ${expected}.`,
    );
  }

  private record(): JsonRecord {
    if (!isJsonRecord(this.value)) this.fail("an object");
    return this.value;
  }
}

function isHttpsUrl(text: string): boolean {
  if (!text.startsWith("https://") || /\s/.test(text)) return false;
  return URL.canParse(text);
}
