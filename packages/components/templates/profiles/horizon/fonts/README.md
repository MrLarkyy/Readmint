# horizon fonts

The fonts the horizon template names (`assets.fonts.*.src` is `fonts/<file>`, resolved against the design file by the CLI and the Action). Every file may be redistributed under the SIL Open Font License 1.1; the licence text of each family sits beside the files. Each file has OS/2 `fsType` 0 (installable embedding), and none of the families declares a Reserved Font Name, so the renderer embeds a subset of the glyphs a section draws.

## Archivo (SIL Open Font License 1.1, `OFL-Archivo.txt`)

Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo). The files are unmodified copies of the static instances from Omnibus-Type/Archivo at commit 211127690e8ff106c36c935f7e5e697114cff103, `fonts/ttf/`; version 2.001.

| file                             | sha256                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `ArchivoCondensed-ExtraBold.ttf` | `2a3198ab615344b280e6412cf3f60a92c5a8e74f076e2f8030a1583747e6ea2a` |

## Geist Mono (SIL Open Font License 1.1, `OFL-Geist.txt`)

Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font). The files are unmodified copies of the static instances from vercel/geist-font release v1.7.2, `GeistMono/ttf/`; version 1.700.

| file                    | sha256                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `GeistMono-Regular.ttf` | `42d8ad2e610238e64e8abfcde3037c63f7850a73928742b7ab7229d897bcb155` |
| `GeistMono-Medium.ttf`  | `90b15711dc3779b2e64e8aff5228154dd019a90bce4947549c4a8a8a43f2ac25` |

A test checks that every font a section names is a file here, declares `embedding: "allowed"` and `OFL-1.1`, and that its sha256 is listed in this file. To set a template in your own font, replace the `src`, `family` and `licence` of the font assets with a file you may embed.
