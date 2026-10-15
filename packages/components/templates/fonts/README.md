# Template fonts

The fonts the starter templates name (`assets.fonts.*.src` is `fonts/<file>`, resolved against the design file by the CLI
and the Action). Both may be redistributed under the SIL Open Font License 1.1; the licence text is `OFL.txt` beside them.

## Montserrat (SIL Open Font License 1.1, `OFL.txt`)

Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat). The licence declares no
Reserved Font Name. Both files have OS/2 `fsType` 0 (installable embedding). They are byte copies of the static
instances kept as test fonts in `packages/renderer/test/fonts/` (see the README there for their origin).

| file                       | version | origin                                           | sha256                                                             |
| -------------------------- | ------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `Montserrat-Medium.ttf`    | 8.000   | `packages/renderer/test/fonts/` (added in RM-13) | `264819b013d40e46a82f5063ae3ce44d3cb8aaced43d85897f4ced66496d5a85` |
| `Montserrat-ExtraBold.ttf` | 8.000   | `packages/renderer/test/fonts/` (added in RM-13) | `ebc2e02bb921205b44f09ba0a5fa7d1174d0f120e873e00b3576d660e0310fb5` |

A test checks that every font a template names is a file here, declares `embedding: "allowed"` and `OFL-1.1`, and that
its sha256 is listed in this table.

To set a template in your own font, replace the `src`, `family` and `licence` of the font asset (the banner names its
headline font `display`) with a file you may embed.
