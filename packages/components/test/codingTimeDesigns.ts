import { parseDesign, type Design } from "@readmint/format";
import type { CodingTimeTemplate } from "../src/index.js";
import codingTimeCard from "../templates/coding-time-card.design.json?raw";

/** The coding-time template files as published, read as text in Node and in the browser alike. */
export const codingTimeSources: Readonly<Record<CodingTimeTemplate, string>> = {
  "coding-time-card": codingTimeCard,
};

/** A fresh, validated copy of a coding-time template; one that does not validate fails the test naming its issues. */
export function loadCodingTime(name: CodingTimeTemplate): Design {
  const result = parseDesign(codingTimeSources[name]);
  if (!result.ok) throw new Error(`${name} does not validate: ${JSON.stringify(result.issues)}`);
  return result.value;
}
