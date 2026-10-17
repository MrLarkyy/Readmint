# Fonts and licensing

A design draws text with fonts you give it: Readmint has no system fonts and never fetches one. This page is the short
version; the exact rules are in [design-format.md](design-format.md#assets) and [renderer.md](renderer.md#fonts).

## Adding a font

A font is an asset of the design: `family`, `src` (a relative path next to the design file, or a base64 data URI),
optionally `weight` and `style`, and a `licence` you declare. TrueType, OpenType (CFF), WOFF and WOFF2 are read. The
bundled starter templates use Montserrat, the profile templates Archivo, Noto Sans, Geist and Geist Mono, all under the
SIL Open Font License 1.1; see [components.md](components.md) for replacing them with your own font and for fallback
fonts that cover more scripts.

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

## Script coverage of the bundled templates

A character the font has no glyph for is looked up in the font's `fallback` fonts, in order; if none has it, it is not
drawn, takes no space, and the render warns `missing-glyph` naming the code points.

| template                      | text                                    | covered                                                                                                       | not drawn                                                              |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| starter templates             | Montserrat (no fallback)                | Latin, Latin Extended-A, Vietnamese, Cyrillic (U+0400..04FF)                                                  | Greek except Δ, Ω, μ, π; emoji, CJK, other scripts                     |
| `year-ring`, `horizon`        | Archivo, with Noto Sans as its fallback | Latin, Latin Extended-A, Vietnamese from Archivo; Cyrillic and Greek from Noto Sans (Δ, Ω, μ, π from Archivo) | emoji, CJK, other scripts                                              |
| `horizon` code and label text | Geist Mono (no fallback)                | Latin, Latin Extended-A except Ĕ ĕ Ĭ ĭ Ĳ ĳ ĸ Ŀ ŀ ŉ Ŏ ŏ ſ, Vietnamese, Cyrillic of the Slavic languages        | Greek except Λ, Ω, λ, μ, π; emoji, CJK, other scripts                  |
| `pinscreen`                   | Geist, Geist Mono (no fallback)         | as Geist Mono above (Geist also has Ĳ ĳ)                                                                      | Greek except Λ, Ω, λ, μ, π (and ω in Geist); emoji, CJK, other scripts |

The remedy for a script a template does not cover is a font asset that has it, listed in the `fallback` of the design's
fonts (a font that may be embedded and a `licence` you can declare), placed next to the design file:

```json
{
  "id": "han",
  "family": "My CJK Font",
  "src": "fonts/MyCJK-Regular.ttf",
  "licence": { "embedding": "allowed", "name": "OFL-1.1" }
}
```

and `"fallback": ["han"]` on each font asset that draws the text. A fallback adds to the output only the glyphs actually
drawn from it.

## Your responsibility

The `licence` is what you declare; Readmint cannot read a licence text. Declare `restricted` for a font you may not
redistribute, and keep font files you may not redistribute out of public repositories. Fonts committed to the Readmint
repository are only ones that may be redistributed, and their licence is recorded beside them.

## Raster output

PNG, WebP, APNG and GIF are drawn from the fonts the SVG embeds, so a font of any supported type works. A font the
renderer drew as paths needs nothing more; text with no usable font fails the export with `raster-font` rather than
writing blank text. See [raster.md](raster.md#fonts).
