import type { ExamplesOptions } from "./ExamplesOptions.js";
import { readmeTitle } from "./readmeTitle.js";

const defaultRepositoryUrl = "https://github.com/MrLarkyy/Readmint";

/** The html block below "## The README" of a template README, fences dropped. */
function readmeSnippet(readme: string, template: string): string {
  const section = /^## The README\s*$/m.exec(readme);
  if (section === null) throw new Error(`${template}/README.md: no "## The README" section`);
  const block = /^```html\n([\s\S]*?)^```\s*$/m.exec(readme.slice(section.index));
  if (block?.[1] === undefined)
    throw new Error(`${template}/README.md: no html block under "## The README"`);
  return block[1].trimEnd();
}

/** The README of one template folder of the examples repository. */
export function exampleTemplateReadme(
  readme: string,
  template: string,
  options: ExamplesOptions,
): string {
  const login = options.login;
  const snippet = readmeSnippet(readme, template)
    .replace(
      /https:\/\/github\.com\/YOUR-LOGIN\/YOUR-REPOSITORY-\d+/g,
      () => `https://github.com/${login}?tab=repositories`,
    )
    .replace(/YOUR-LOGIN/g, () => login);
  if (snippet.includes("YOUR-"))
    throw new Error(`${template}/README.md: a YOUR- placeholder is left`);
  const url = `${options.repositoryUrl ?? defaultRepositoryUrl}/tree/main/packages/components/templates/profiles/${template}`;
  return [
    `# ${readmeTitle(readme, template)}`,
    "",
    `Rendered by Readmint with live data of ${login}. The designs are in [designs/](designs/), the personal texts in \`designs/settings.json\` (Action input \`props-file\`).`,
    `How to use them and the props of each section: [the template README](${url}).`,
    "",
    snippet,
    "",
  ].join("\n");
}
