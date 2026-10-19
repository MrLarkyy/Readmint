import { version } from "./answerFields.js";
import type { MavenArtifact } from "./RegistryData.js";
import { RegistryShapeError } from "./RegistryShapeError.js";

const MAX_DEPTH = 16;
const MAX_TAGS = 200_000;
const MAX_FIELD_LENGTH = 256;
const TAG = /^(\/?)([A-Za-z_][A-Za-z0-9_.-]*)([^<>]*?)(\/?)$/;
const FIELDS: ReadonlyMap<string, string> = new Map([
  ["metadata/groupId", "groupId"],
  ["metadata/artifactId", "artifactId"],
  ["metadata/versioning/release", "release"],
  ["metadata/versioning/latest", "latest"],
  ["metadata/versioning/lastUpdated", "lastUpdated"],
]);

/**
 * The artifact of a `maven-metadata.xml`, or `null` when its `groupId` or `artifactId` is not the one asked for. Not
 * an XML parser: one forward pass over tags that reads only five fixed fields of the root `metadata`, so a DOCTYPE or
 * any other markup declaration (and with it every entity declaration) is refused, an entity reference in a read field
 * is refused, and nothing recurses or rescans. Depth, tag count and field length are capped.
 */
export function parseMavenMetadata(
  text: string,
  group: string,
  artifact: string,
): MavenArtifact | null {
  const fields = readFields(text);
  if (fields.get("groupId") !== group || fields.get("artifactId") !== artifact) return null;
  return {
    group,
    artifact,
    latestVersion: version(fields.get("release") ?? fields.get("latest"), "release"),
    updated: updatedDay(fields.get("lastUpdated")),
  };
}

function readFields(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  const path: string[] = [];
  let tags = 0;
  let rooted = false;
  let reading: { readonly name: string; readonly depth: number; readonly start: number } | null =
    null;
  let position = 0;
  for (;;) {
    const open = text.indexOf("<", position);
    if (open === -1) break;
    if (text.startsWith("<?", open)) {
      position = after(text, "?>", open + 2);
      continue;
    }
    if (text.startsWith("<!--", open)) {
      position = after(text, "-->", open + 4);
      continue;
    }
    if (text.startsWith("<!", open)) {
      throw new RegistryShapeError(
        "has a DOCTYPE or another markup declaration; DTDs and entity declarations are refused",
      );
    }
    const close = text.indexOf(">", open);
    if (close === -1) throw malformed();
    position = close + 1;
    tags += 1;
    const tag = TAG.exec(text.slice(open + 1, close));
    if (tag === null || tags > MAX_TAGS) throw malformed();
    const [, ending = "", name = "", , selfClosing = ""] = tag;
    if (ending === "/") {
      if (selfClosing !== "" || path.pop() !== name) throw malformed();
      if (reading?.depth === path.length + 1) {
        fields.set(reading.name, fieldText(text.slice(reading.start, open)));
        reading = null;
      }
      continue;
    }
    if (reading !== null) throw malformed();
    if (path.length === 0) {
      if (rooted || name !== "metadata") throw malformed();
      rooted = true;
    }
    path.push(name);
    if (path.length > MAX_DEPTH) throw malformed();
    const field = FIELDS.get(path.join("/"));
    if (selfClosing === "/") path.pop();
    else if (field !== undefined && !fields.has(field)) {
      reading = { name: field, depth: path.length, start: position };
    }
  }
  if (!rooted || path.length > 0) throw malformed();
  return fields;
}

function after(text: string, end: string, from: number): number {
  const at = text.indexOf(end, from);
  if (at === -1) throw malformed();
  return at + end.length;
}

function fieldText(raw: string): string {
  const value = raw.trim();
  if (value.length > MAX_FIELD_LENGTH || value.includes("&")) throw malformed();
  return value;
}

function malformed(): RegistryShapeError {
  return new RegistryShapeError("is not valid maven-metadata.xml");
}

/** `lastUpdated` is `yyyyMMddHHmmss` in UTC; its date part must exist on the calendar. */
function updatedDay(value: string | undefined): string {
  const match =
    value === undefined ? null : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (match === null) throw new RegistryShapeError("lastUpdated is not a date");
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    year < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    throw new RegistryShapeError("lastUpdated is not a date");
  }
  return date.toISOString().slice(0, 10);
}
