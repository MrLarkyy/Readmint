import { own, parseJson, record, version } from "./answerFields.js";

/** The version of the `latest` manifest. */
export function parseNpmLatest(text: string): string {
  return version(own(record(parseJson(text), "the answer"), "version"), "version");
}
