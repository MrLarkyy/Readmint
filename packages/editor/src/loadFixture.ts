import { isDataNamespace } from "@readmint/data";
import { refuse } from "./commitDesign.js";
import { EditorLimits } from "./EditorLimits.js";
import type { EditorState } from "./EditorState.js";

/**
 * Fixture data from JSON text: an object whose keys are data namespaces, at most `maxFixtureBytes` of UTF-8, as the
 * CLI's `--data` file. Refused data leaves the state unchanged; the issue never quotes the data.
 */
export function loadFixture(state: EditorState, text: string): EditorState {
  const fail = (reason: string) => refuse(state, "fixture", `fixture data ${reason}`);
  // A UTF-16 code unit is at most 3 bytes of UTF-8: only text near the limit is measured exactly.
  if (text.length * 3 > EditorLimits.maxFixtureBytes) {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > EditorLimits.maxFixtureBytes) {
      return fail(`is larger than ${String(EditorLimits.maxFixtureBytes)} bytes`);
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail("is not valid JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("must be a JSON object of data namespaces");
  }
  for (const key of Object.keys(value)) {
    if (!isDataNamespace(key)) {
      return fail(
        `has a key that is not a data namespace (a lowercase letter, then up to 31 lowercase letters or digits)`,
      );
    }
  }
  return { ...state, data: value as Record<string, unknown>, issues: [] };
}
