/** The render manifest every template folder holds. */
const manifestFile = "renders.json";

/** The workflow of the examples repository: one step per template, rendering its `renders.json`. */
export function exampleWorkflow(
  actionRef: string,
  templates: readonly {
    readonly name: string;
    readonly hasSettings: boolean;
  }[],
): string {
  const steps = templates.flatMap(({ name, hasSettings }) => [
    `      - name: Render ${name}`,
    `        uses: ${actionRef}`,
    "        with:",
    `          output-dir: ${name}/readmint`,
    ...(hasSettings ? [`          props-file: ${name}/designs/settings.json`] : []),
    `          commit-message: "Update ${name} graphics"`,
    `          manifest: ${name}/designs/${manifestFile}`,
  ]);
  return [
    "name: Readmint",
    "on:",
    "  push:",
    "    branches: [main]",
    "    paths:",
    '      - "*/designs/**"',
    '      - ".github/workflows/readmint.yml"',
    "  schedule:",
    '    - cron: "17 3 * * *"',
    "  workflow_dispatch:",
    "permissions:",
    "  contents: write",
    "concurrency:",
    "  group: readmint",
    "  cancel-in-progress: false",
    "jobs:",
    "  render:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v7",
    ...steps,
    "",
  ].join("\n");
}
