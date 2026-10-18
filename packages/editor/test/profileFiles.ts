import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRenderManifest, type RenderManifestEntry } from "@readmint/format";

const folders = join(import.meta.dirname, "..", "..", "components", "templates", "profiles");

/** The renders of a profile template as its `renders.json` lists them, read from disk as a user has it. */
export function profileRenders(template: string): readonly RenderManifestEntry[] {
  const result = parseRenderManifest(readFileSync(join(folders, template, "renders.json"), "utf8"));
  if (!result.ok) throw new Error(`${template}/renders.json does not validate`);
  return result.value.renders;
}

/** The design file a render of the template names. */
export function profileFile(template: string, name: string): string {
  const entry = profileRenders(template).find((render) => render.name === name);
  if (entry === undefined) throw new Error(`${template}/renders.json has no render ${name}`);
  return entry.design;
}

/** The text of the design file a render names. */
export function profileSource(template: string, name: string): string {
  return readFileSync(join(folders, template, profileFile(template, name)), "utf8");
}

const fonts = new Map<string, Readonly<Record<string, Uint8Array>>>();

/** The font files of a template folder by the relative `src` its designs give them (shared: never change them). */
export function profileFontFiles(template: string): Readonly<Record<string, Uint8Array>> {
  let files = fonts.get(template);
  if (files === undefined) {
    const folder = join(folders, template, "fonts");
    files = Object.fromEntries(
      readdirSync(folder)
        .filter((file) => file.endsWith(".ttf"))
        .map((file) => [`fonts/${file}`, new Uint8Array(readFileSync(join(folder, file)))]),
    );
    fonts.set(template, files);
  }
  return files;
}
