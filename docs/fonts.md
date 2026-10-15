# Fonts and licensing

A design draws text with fonts you give it: Readmint has no system fonts and never fetches one. This page is the short
version; the exact rules are in [design-format.md](design-format.md#assets) and [renderer.md](renderer.md#fonts).

## Adding a font

A font is an asset of the design: `family`, `src` (a relative path next to the design file, or a base64 data URI),
optionally `weight` and `style`, and a `licence` you declare. TrueType, OpenType (CFF), WOFF and WOFF2 are read. The
bundled starter templates use Montserrat under the SIL Open Font License 1.1; see
[components.md](components.md) for replacing it with your own font and for fallback fonts that cover more scripts.

```json
{
  "id": "body",
  "family": "My Font",
  "src": "fonts/MyFont-Regular.ttf",
  "licence": { "embedding": "allowed", "name": "OFL-1.1" }
}
```

## When a font is embedded

By default the SVG carries a subset of the font: only the glyphs the design draws. That keeps the output
self-contained, which GitHub needs, since it loads no external font. The renderer embeds a font only when all of this
holds:

- the asset declares `licence.embedding: "allowed"`;
- the font file's own embedding permission (OS/2 `fsType`) allows it; the stricter of the two wins;
- the font has no Reserved Font Name (SIL Open Font License). An embedded subset is a Modified Version, which may not
  use that name.

Otherwise the text is drawn as path data and nothing of the font is embedded; the render warns `font-not-embeddable` or
`font-reserved-name`. Set `drawAs: "paths"` on a font to always draw its text as paths.

## Your responsibility

The `licence` is what you declare; Readmint cannot read a licence text. Declare `restricted` for a font you may not
redistribute, and keep font files you may not redistribute out of public repositories. Fonts committed to the Readmint
repository are only ones that may be redistributed, and their licence is recorded beside them.

## Raster output

PNG, WebP, APNG and GIF are drawn from the fonts the SVG embeds, so a font of any supported type works. A font the
renderer drew as paths needs nothing more; text with no usable font fails the export with `raster-font` rather than
writing blank text. See [raster.md](raster.md#fonts).
