/** `readmint --help`. */
export const helpText = `Usage: readmint <command> <design> [options]

Commands:
  render <design>     Render the design to SVG (standard output or --out) or to a raster image (--out)
  validate <design>   Check the design and load its assets; with --data also render it
  preview <design>    Serve a live preview on http://127.0.0.1:<port>/ (this computer only)
  help                Show this help

Options:
  --root <dir>        Folder the design file must lie in (default: the current folder)
  --data <file>       Fixture data: a JSON object of data namespaces, at most 8 MiB
  --locale <tag>      Language tag for number and date filters (default: the design locale, else en)
  --time <ms>         Render one frame of the animation as a still image (render, validate)
  --out <file>        Write the output to this file instead of standard output (render)
  --format <name>     svg, png, webp, apng or gif (render; default: from the --out extension
                      .png, .webp or .gif, else svg); raster formats need --out
  --scale <n>         Raster pixels per design pixel, 1..4 (raster formats; default 2)
  --frame-rate <n>    Frames per second of an animation, 1..60, gif 1..50 (raster formats;
                      default 30, gif 25)
  --port <n>          Preview port, 0 for any free one (preview; default 4870)
  -h, --help          Show this help
  --version           Show the version

An animated design becomes an animated webp, apng or gif; png is always a still image.
The CLI reads no token and makes no network requests: data comes only from --data.

Exit codes: 0 ok, 1 invalid design or failed render, 2 usage, 3 file or port problem, 70 internal error.
See docs/cli.md.
`;
