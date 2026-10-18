import { count, own, parseJson, record, version } from "./answerFields.js";
import type { MavenArtifact } from "./RegistryData.js";
import { RegistryShapeError } from "./RegistryShapeError.js";

const LAST_MILLISECOND_OF_9999 = 253_402_300_799_999;

/**
 * The artifact of a `solrsearch` answer, or `null` when Maven Central lists none: no document, or a document whose
 * group or artifact is not the one asked for (the search is not exact for every query).
 */
export function parseMavenSearch(
  text: string,
  group: string,
  artifact: string,
): MavenArtifact | null {
  const response = record(own(record(parseJson(text), "the answer"), "response"), "response");
  const found = count(own(response, "numFound"), "numFound");
  const docs = own(response, "docs");
  if (!Array.isArray(docs)) throw new RegistryShapeError("docs is not a list");
  if (found === 0 || docs.length === 0) return null;
  const doc = record(docs[0] as unknown, "docs[0]");
  if (own(doc, "g") !== group || own(doc, "a") !== artifact) return null;
  const timestamp = own(doc, "timestamp");
  if (
    typeof timestamp !== "number" ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > LAST_MILLISECOND_OF_9999
  ) {
    throw new RegistryShapeError("timestamp is not a date");
  }
  return {
    group,
    artifact,
    latestVersion: version(own(doc, "latestVersion"), "latestVersion"),
    updated: new Date(timestamp).toISOString().slice(0, 10),
  };
}
