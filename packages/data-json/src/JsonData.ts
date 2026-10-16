import type { DataObject } from "@readmint/data";

/** Version of the JSON data object; it changes only with a breaking change to its shape. */
export const JSON_DATA_VERSION = 0;

/** Namespace a JSON source binds under when the host names none. */
export const JSON_DATA_DEFAULT_NAMESPACE = "json";

/** A parsed JSON value: objects are plain, own-property only, in document key order. */
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * What a JSON source binds: the document under `document`, whatever its type. A document with its
 * own top-level `version` keeps it there, so `version` always means the data object's version.
 */
export interface JsonData extends DataObject {
  readonly version: typeof JSON_DATA_VERSION;
  readonly document: JsonValue;
}
