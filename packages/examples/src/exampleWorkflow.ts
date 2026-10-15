/** The workflow of the examples repository: one step per template, the light designs of each. */
export function exampleWorkflow(
  actionRef: string,
  templates: readonly { readonly name: string; readonly designs: readonly string[] }[],
): string {
  const steps = templates.flatMap(({ name, designs }) => [
    `      - name: Render ${name}`,
    `        uses: ${actionRef}`,
    "        with:",
    `          output-dir: ${name}/readmint`,
    `          commit-message: "Update ${name} graphics"`,
    "          designs: |",
    ...designs.map((design) => `            ${name}/designs/${design}`),
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
