import { fetchHttpsText, type FetchedText } from "@readmint/data";
import { checkMediaType } from "./checkMediaType.js";
import type { JsonFetch } from "./JsonSourceOptions.js";

export interface FetchJsonContext {
  readonly namespace: string;
  /** Sent only while a hop stays on the origin of the first URL. */
  readonly headers: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly fetch: JsonFetch;
  readonly signal: AbortSignal | null;
}

/** GETs the JSON document with the shared https rules of `fetchHttpsText`, labelled "JSON". */
export function fetchJsonDocument(url: URL, context: FetchJsonContext): Promise<FetchedText> {
  return fetchHttpsText(url, {
    ...context,
    label: "JSON",
    accept: "application/json",
    checkMediaType,
  });
}
