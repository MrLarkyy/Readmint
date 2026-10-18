import { count, own, parseJson, record } from "./answerFields.js";

/** The downloads of the point answer. */
export function parseNpmDownloads(text: string): number {
  return count(own(record(parseJson(text), "the answer"), "downloads"), "downloads");
}
