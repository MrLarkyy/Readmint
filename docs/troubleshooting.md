# Troubleshooting

Start with the message: the Action prints one `::error::` line per problem and the CLI one line per issue, each naming
what it is about (the format is in [action.md](action.md#errors) and [cli.md](cli.md#messages)).

## The workflow does not commit anything

- The job needs `permissions: contents: write`, and `actions/checkout` must keep its credentials (the default).
- The checkout must be the latest commit of the branch the Action pushes to, without `path:`. A detached HEAD, a pull
  request merge commit or a branch that moved since the checkout is refused before anything is written. See
  [Pushing](action.md#pushing).
- Nothing changed: when the rendered files equal the last commit, there is nothing to commit and `changed` is `false`.
- A push made with the workflow's `GITHUB_TOKEN` starts no other workflow.

## The data does not load

- `GitHub data (<code>): ...` carries the code of [data-github.md](data-github.md#errors); `missing-token`,
  `unauthorized`, `forbidden` and `rate-limited` are the usual ones.
- The owner must be a user. For an organisation, point `login` at a user.
- The default token sees public data only. Private contributions need a personal access token passed as `token`; read
  [Repositories and privacy](data-github.md#repositories-and-privacy) first, because the counts end up in the SVG.
- To work offline, use `data-file` (Action) or `--data` (CLI) with fixture data ([cli.md](cli.md#fixture-data)).

## The design is rejected

- `readmint validate design.json` prints every issue with its position and a JSON Pointer path; the codes are listed in
  the Issues section of [design-format.md](design-format.md#issues).
- An asset refused when it is loaded (`AssetPathError`) is a path outside the design's folder, a symlink leaving it, or a
  name Windows cannot take; see [asset-loading.md](asset-loading.md).
- An image bound to data fails with `image-...` codes when the URL is not https on an allowed host; see
  [Images bound from data](asset-loading.md#images-bound-from-data).

## The text is missing or drawn as shapes

- Text without a font asset, or characters the font does not have, are not drawn: the render warns `missing-glyph`. Add
  a font with those glyphs to the `fallback` list ([fonts.md](fonts.md)).
- A font that may not be embedded is drawn as paths on purpose (`font-not-embeddable`, `font-reserved-name`); the text
  still looks right but is not selectable.
- A raster export fails with `raster-font` for a WOFF2 font or a broken font file; use TrueType, OpenType or WOFF.

## The output is too large or the export is refused

A raster export over a limit reports the measured value, the limit and a fix; the limits are in
[raster.md](raster.md#limits). A smaller `scale`, fewer frames or a lower `frame-rate` are the usual fixes.

## Exit codes of the CLI

`0` ok, `1` invalid design or failed render, `2` usage, `3` unusable file or port, `4` data, `70` a bug in Readmint; see
[cli.md](cli.md#exit-codes).
