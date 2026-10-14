/** `readmint --help`. */
export const helpText = `Usage: readmint <command> <design> [options]

Commands:
  render <design>     Render the design and write the SVG to standard output or --out
  validate <design>   Check the design and load its assets; with --data also render it
  preview <design>    Serve a live preview on http://127.0.0.1:<port>/ (this computer only)
  help                Show this help

Options:
  --root <dir>        Folder the design file must lie in (default: the current folder)
  --data <file>       Fixture data: a JSON object of data namespaces, at most 8 MiB
  --locale <tag>      Language tag for number and date filters (default: en)
  --time <ms>         Render one frame of the animation as a static SVG (render, validate)
  --out <file>        Write the SVG to this file instead of standard output (render)
  --port <n>          Preview port, 0 for any free one (preview; default 4870)
  -h, --help          Show this help
  --version           Show the version

Output is SVG only until raster export (PNG, WebP, GIF) exists. The CLI reads no token and
makes no network requests: data comes only from --data.

Exit codes: 0 ok, 1 invalid design or failed render, 2 usage, 3 file or port problem, 70 internal error.
See docs/cli.md.
`;
