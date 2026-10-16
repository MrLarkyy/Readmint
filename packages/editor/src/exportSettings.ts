import type { ComponentPropValue, DesignProps } from "@readmint/format";
import type { EditorSettings } from "./EditorSettings.js";
import { sectionSpans } from "./settingsSpans.js";

/**
 * The settings file text, in the format `readmint render --props` and the Action's `props-file` read. A file that was
 * loaded keeps its text: an unedited section stays byte for byte, and without any edit the result is the loaded text.
 * Only the value of an edited section is replaced, written with two-space indentation at the key's indent. A session
 * without a loaded file writes all sections.
 */
export function exportSettings(settings: EditorSettings): string {
  const { source, loaded, sections } = settings;
  if (source === undefined || loaded === undefined) return whole(sections);
  const sameNames =
    Object.keys(loaded).length === Object.keys(sections).length &&
    Object.keys(loaded).every((name) => Object.hasOwn(sections, name));
  const edited = Object.keys(sections).filter(
    (name) => !Object.hasOwn(loaded, name) || !samePropsOf(sections, loaded, name),
  );
  if (sameNames && edited.length === 0) return source;
  const spans = sectionSpans(source);
  if (!sameNames || !edited.every((name) => spans.has(name))) return whole(sections);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  let text = source;
  const ordered = edited
    .map((name) => ({ name, span: spans.get(name) }))
    .sort((a, b) => (b.span?.start ?? 0) - (a.span?.start ?? 0));
  for (const { name, span } of ordered) {
    if (span === undefined) continue;
    const value = JSON.stringify(sections[name], null, 2).replaceAll("\n", `${eol}${span.indent}`);
    text = text.slice(0, span.start) + value + text.slice(span.end);
  }
  return text;
}

function whole(sections: DesignProps): string {
  return `${JSON.stringify(sections, null, 2)}\n`;
}

function samePropsOf(a: DesignProps, b: DesignProps, name: string): boolean {
  const left = a[name];
  const right = b[name];
  if (left === undefined || right === undefined) return left === right;
  const names = Object.keys(left);
  if (names.length !== Object.keys(right).length) return false;
  return names.every((prop) => Object.hasOwn(right, prop) && sameValue(left[prop], right[prop]));
}

function sameValue(a: ComponentPropValue | undefined, b: ComponentPropValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}
