import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExampleFile } from "./ExampleFile.js";
import type { ExamplesOptions } from "./ExamplesOptions.js";
import { exampleRootReadme } from "./exampleRootReadme.js";
import { exampleTemplateReadme } from "./exampleTemplateReadme.js";
import { listFiles } from "./listFiles.js";
import { readmeTitle } from "./readmeTitle.js";
import { assertNoLink } from "./assertNoLink.js";
import { exampleWorkflow } from "./exampleWorkflow.js";
import { assertActionSupportsDesigns } from "./assertActionSupportsDesigns.js";

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/** The template's shared settings (`--props`): not a design, the examples already have the texts merged in. */
const settingsFile = "settings.json";
const sectionOf = (file: string): string => file.replace(/(\.dark)?\.json$/, "");
const readText = (path: string): string => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** The template folders of `profilesDir`: those named in `props` first, in its order, then the rest sorted. */
function discoverTemplates(profilesDir: string, props: ExamplesOptions["props"]): string[] {
  const folders = readdirSync(profilesDir)
    .filter((name) => {
      assertNoLink(join(profilesDir, name));
      return lstatSync(join(profilesDir, name)).isDirectory();
    })
    .sort(byCodeUnit);
  for (const name of Object.keys(props)) {
    if (!folders.includes(name)) {
      throw new Error(`example props for "${name}", which is no template folder`);
    }
  }
  const known = Object.keys(props);
  return [...known, ...folders.filter((name) => !known.includes(name))];
}

function mergedDesign(
  text: string,
  file: string,
  texts: Readonly<Record<string, unknown>>,
): string {
  const design = JSON.parse(text) as { layers?: { type?: unknown; props?: object }[] };
  const [root, ...rest] = design.layers ?? [];
  if (root?.type !== "component") throw new Error(`${file}: the root layer is not a component`);
  const merged = { ...design, layers: [{ ...root, props: { ...root.props, ...texts } }, ...rest] };
  return `${JSON.stringify(merged, null, 2)}\n`;
}

/**
 * The examples repository for the template folders of `<templatesDir>/profiles`: per template the designs with the
 * personal texts merged in, the fonts, a README, plus the root README and the workflow. Pure and deterministic.
 */
export function buildExamples(templatesDir: string, options: ExamplesOptions): ExampleFile[] {
  const profilesDir = join(templatesDir, "profiles");
  const files: ExampleFile[] = [];
  const summaries: { name: string; title: string; designs: string[] }[] = [];
  for (const name of discoverTemplates(profilesDir, options.props)) {
    const dir = join(profilesDir, name);
    const all = listFiles(dir);
    const designFiles = all.filter(
      (file) => !file.includes("/") && file.endsWith(".json") && file !== settingsFile,
    );
    const light = designFiles.filter((file) => !file.endsWith(".dark.json"));
    for (const file of light) {
      const twin = file.replace(/\.json$/, ".dark.json");
      if (!designFiles.includes(twin)) throw new Error(`${name}/${file}: no ${twin}`);
    }
    const templateProps = options.props[name] ?? {};
    for (const section of Object.keys(templateProps)) {
      if (!light.includes(`${section}.json`)) {
        throw new Error(`example props for ${name}/${section}, which has no design file`);
      }
    }
    for (const file of designFiles) {
      const texts = templateProps[sectionOf(file)];
      const raw = readFileSync(join(dir, file));
      assertActionSupportsDesigns(options.actionRef, [
        { file: `${name}/${file}`, text: raw.toString("utf8") },
      ]);
      const content =
        texts === undefined ? raw : mergedDesign(raw.toString("utf8"), `${name}/${file}`, texts);
      files.push({ path: `${name}/designs/${file}`, content });
    }
    for (const file of all.filter((path) => path.startsWith("fonts/"))) {
      files.push({ path: `${name}/designs/${file}`, content: readFileSync(join(dir, file)) });
    }
    const readme = readText(join(dir, "README.md"));
    files.push({
      path: `${name}/README.md`,
      content: exampleTemplateReadme(readme, name, options),
    });
    summaries.push({ name, title: readmeTitle(readme, name), designs: light });
  }
  files.push({
    path: "README.md",
    content: exampleRootReadme(options.actionRef, options.login, summaries),
  });
  files.push({
    path: ".github/workflows/readmint.yml",
    content: exampleWorkflow(options.actionRef, summaries),
  });
  return files.sort((a, b) => byCodeUnit(a.path, b.path));
}
