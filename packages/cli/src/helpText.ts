/** `readmint --help`. */
export const helpText = `Usage: readmint <command> <design> [options]

Commands:
  render <design>     Render the design to SVG (standard output or --out) or to a raster image (--out)
  validate <design>   Check the design and load its assets; with data (--data, --github, --data-json or --data-feed)
                      also render it
  preview <design>    Serve a live preview on http://127.0.0.1:<port>/ (this computer only)
  help                Show this help

Options:
  --root <dir>        Folder the design file must lie in (default: the current folder)
  --data <file>       Fixture data: a JSON object of data namespaces, at most 8 MiB
  --props <file>      Settings: a JSON object of root component props by section (the design file name
                      without .dark), merged into the design (render, validate, preview)
  --locale <tag>      Language tag for number and date filters (default: the design locale, else en)
  --time <ms>         Render one frame of the animation as a still image (render, validate)
  --out <file>        Write the output to this file instead of standard output (render)
  --format <name>     svg, png, webp, apng or gif (render; default: from the --out extension
                      .png, .apng, .webp or .gif, else svg); raster formats need --out
  --scale <n>         Raster pixels per design pixel, 1..4 (raster formats; default 2)
  --frame-rate <n>    Frames per second of an animation, 1..60, gif 1..50 (raster formats;
                      default 30, gif 25)
  --quality <n>       Lossy WebP at this quality, 1..100 (webp; default lossless)
  --port <n>          Preview port, 0 for any free one (preview; default 4870)
  --open              Open the preview address in the default browser (preview)
  --fetch-images      Fetch the images whose src is bound to data (https, allowed hosts only)
  --github            Load live GitHub data as { github } instead of --data, with the token
                      from GH_TOKEN, else GITHUB_TOKEN
  --login <login>     GitHub login --github loads (default: the token's owner)
  --exclude-repositories <names>
                      Comma separated repositories (name or owner/name) --github leaves out of
                      the repository list, stars, forks, languages and the pinned fallback; the
                      repository total, pushes and the contribution calendar still include them
  --language-commit-cap <n>
                      Own commits (0..2000, default 0 = off) --github reads, one request each,
                      to fill github.languagesAuthored with the lines you added per language
  --data-json [<ns>=]<source>
                      Load a JSON document as { <ns>: { version: 0, document } } (default ns json):
                      a file inside --root (path relative to --root) or an https URL; repeatable, at most 8, added to
                      --data or --github data
  --data-json-header <ns>:<Header-Name>=<ENV_NAME>
                      Send a header to the https URL of <ns>, its value read from the environment
                      variable ENV_NAME; repeatable
  --data-feed [<ns>=]<url>
                      Load an RSS 2.0 or Atom 1.0 feed from an https URL as
                      { <ns>: { version: 0, title, link, entries } } (default ns feed), entries newest
                      first; repeatable, at most 8, added to --data or --github data
  --data-feed-limit <ns>=<n>
                      Entries kept from the feed of <ns>, 1..50 (default 5); repeatable
  -h, --help          Show this help
  --version           Show the version

An animated design becomes an animated webp, apng or gif; png is always a still image.
The token is never an argument: only --github uses GH_TOKEN or GITHUB_TOKEN, and no message
shows it, nor a --data-json-header value, nor a --data-feed URL. The CLI makes network requests
only with --github (GitHub API, with the token), --data-json with an https URL (its headers
only), --data-feed (no credentials) and --fetch-images (image requests, never with
credentials). A --data-json file path is relative to --root, not to the current folder.

Exit codes: 0 ok, 1 invalid design or failed render, 2 usage, 3 file or port problem, 4 data source, 70 internal error.
See docs/cli.md.
`;
