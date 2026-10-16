import { DataSourceError } from "@readmint/data";
import { JSON_DATA_VERSION, type JsonData, type JsonValue } from "./JsonData.js";
import { JsonLimits } from "./JsonSourceOptions.js";

const OPEN_ARRAY = 0x5b;
const OPEN_OBJECT = 0x7b;
const CLOSE_ARRAY = 0x5d;
const CLOSE_OBJECT = 0x7d;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;

/**
 * Parses a document (UTF-8 bytes or decoded text) into the data object. The nesting depth is
 * checked by a linear scan before `JSON.parse`, so a hostile document cannot overflow the stack;
 * the value count is checked while rebuilding. Objects are rebuilt as own data properties, so a
 * `__proto__` key stays a plain key. Errors never quote the document.
 */
export function parseJsonDocument(input: string | Uint8Array, namespace: string): JsonData {
  const text = typeof input === "string" ? input : decode(input, namespace);
  checkDepth(text, namespace);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DataSourceError(
      namespace,
      "invalid-response",
      "The JSON document is not valid JSON.",
    );
  }
  const counter = { nodes: 0 };
  return { version: JSON_DATA_VERSION, document: rebuild(parsed, counter, namespace) };
}

function decode(bytes: Uint8Array, namespace: string): string {
  try {
    // Strips one leading byte order mark.
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DataSourceError(
      namespace,
      "invalid-response",
      "The JSON document is not valid UTF-8.",
    );
  }
}

function checkDepth(text: string, namespace: string): void {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (code === BACKSLASH) index += 1;
      else if (code === QUOTE) inString = false;
    } else if (code === QUOTE) {
      inString = true;
    } else if (code === OPEN_ARRAY || code === OPEN_OBJECT) {
      depth += 1;
      if (depth > JsonLimits.maxDepth) {
        throw new DataSourceError(
          namespace,
          "too-large",
          `The JSON document is nested deeper than ${String(JsonLimits.maxDepth)} levels.`,
        );
      }
    } else if (code === CLOSE_ARRAY || code === CLOSE_OBJECT) {
      depth -= 1;
    }
  }
}

function rebuild(value: unknown, counter: { nodes: number }, namespace: string): JsonValue {
  counter.nodes += 1;
  if (counter.nodes > JsonLimits.maxNodes) {
    throw new DataSourceError(
      namespace,
      "too-large",
      `The JSON document holds more than ${String(JsonLimits.maxNodes)} values.`,
    );
  }
  // JSON.parse turns 1e400 into Infinity, which JSON cannot hold.
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new DataSourceError(
      namespace,
      "invalid-response",
      "The JSON document holds a number too large for a double.",
    );
  }
  if (value === null || typeof value !== "object") return value as JsonValue;
  if (Array.isArray(value)) return value.map((item: unknown) => rebuild(item, counter, namespace));
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record).map((key) => [key, rebuild(record[key], counter, namespace)]),
  );
}
