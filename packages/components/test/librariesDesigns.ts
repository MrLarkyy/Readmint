import { parseDesign, type Design } from "@readmint/format";
import type { LibraryTemplate } from "../src/index.js";
import librariesCard from "../templates/libraries-card.design.json?raw";

/** The library template files as published, read as text in Node and in the browser alike. */
export const librarySources: Readonly<Record<LibraryTemplate, string>> = {
  "libraries-card": librariesCard,
};

/** A fresh, validated copy of a library template; one that does not validate fails the test naming its issues. */
export function loadLibraries(name: LibraryTemplate): Design {
  const result = parseDesign(librarySources[name]);
  if (!result.ok) throw new Error(`${name} does not validate: ${JSON.stringify(result.issues)}`);
  return result.value;
}
