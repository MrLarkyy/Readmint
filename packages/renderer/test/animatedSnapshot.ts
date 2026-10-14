import { animationDesigns } from "./animationDesigns.js";
import { renderFixture } from "./renderFixture.js";

/**
 * The animated SVG (no `time`) of a design, embedded font data replaced by its length: the snapshot pins the
 * structure and the CSS, the golden suites pin the font embedding.
 */
export function animatedSnapshot(name: string): string {
  const entry = animationDesigns.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`no animation design ${name}`);
  return renderFixture(entry.input).replace(
    /data:font\/(\w+);base64,[A-Za-z0-9+/=]+/gu,
    (match, type: string) => `data:font/${type};base64-length=${String(match.length)}`,
  );
}
