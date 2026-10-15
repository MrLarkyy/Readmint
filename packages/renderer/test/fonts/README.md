# Test fonts

Every font here may be redistributed under the SIL Open Font License 1.1; the licence texts (`OFL.txt` and one
`OFL-<family>.txt` per Noto family, each with its own copyright line) sit beside them.

## Montserrat (SIL Open Font License 1.1, `OFL.txt`)

Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat). The licence declares no
Reserved Font Name. All files have OS/2 `fsType` 0 (installable embedding).

| file                       | version | source                                                                                                | sha256                                                             |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Montserrat-Medium.ttf`    | 8.000   | added with the renderer (RM-13); static instance, source download not recorded                        | `264819b013d40e46a82f5063ae3ce44d3cb8aaced43d85897f4ced66496d5a85` |
| `Montserrat-ExtraBold.ttf` | 8.000   | added with the renderer (RM-13); static instance, source download not recorded                        | `ebc2e02bb921205b44f09ba0a5fa7d1174d0f120e873e00b3576d660e0310fb5` |
| `Montserrat-Medium.otf`    | 7.222   | https://raw.githubusercontent.com/JulietaUla/Montserrat/v7.222/fonts/otf/Montserrat-Medium.otf        | `b7570739ca2c828d3628b0e7d9d3ebcfe6855085f7c36ae9d8ccca2515833d79` |
| `Montserrat-Medium.woff`   | 7.222   | https://raw.githubusercontent.com/JulietaUla/Montserrat/v7.222/fonts/webfonts/Montserrat-Medium.woff  | `10171dd6c444e5a8fc277e34174292310f0f32f4c3940b4dd9a8637171e1e957` |
| `Montserrat-Medium.woff2`  | 7.222   | https://raw.githubusercontent.com/JulietaUla/Montserrat/v7.222/fonts/webfonts/Montserrat-Medium.woff2 | `f8c1310c6b5351bef1ed7a6d0ff52aba46264a4c42f5346e1d0a1fe6e189e1c4` |

Tag `v7.222` (commit `5dae7a4ef9c0bf9fe48dc54fd1076eefaa0a8c7e`) is the newest release holding a WOFF next to the
WOFF2; the WOFF and WOFF2 wrap the TrueType font of that release, the OTF has CFF outlines of the same design and
metrics. `OFL.txt` is the licence of both releases.

## Readmint Test Symbols (SIL Open Font License 1.1, `OFL.txt`)

`ReadmintTestSymbols.ttf` (`a7e08e5dfdb18afbdf7236ddc8b6ef2b7b7a9327535dc6eeb067fb6c48a5840e`) is original work:
Copyright 2026 The Readmint Contributors, licensed under the SIL Open Font License 1.1 with no Reserved Font Name.
The licence text in `OFL.txt` applies to it (that file's header names Montserrat's copyright; this font's copyright
line is the one here and in its name table, records 0, 13 and 14). It holds no third-party outlines or names.
`readmintTestSymbols()` in `packages/fonts/test/readmintTestSymbols.ts` builds it byte for byte (a test compares
them). It draws U+2605, U+25CF and U+1F536, which Montserrat lacks, so fallback and characters above the BMP
can be tested.

## Noto Naskh Arabic, Noto Sans Devanagari (SIL Open Font License 1.1, `OFL-<family>.txt`)

Copyright 2022 The Noto Project Authors (https://github.com/notofonts/arabic and
https://github.com/notofonts/devanagari). The licences declare no Reserved Font Name. All three files have OS/2
`fsType` 0 (installable embedding). They are subsets of the static unhinted TrueType fonts of the notofonts GitHub release
assets, made with fontTools 4.66.1 so the shaping tests stay small; every layout table (GDEF, GSUB, GPOS) and the whole
name table are kept, outlines are unchanged. `NotoNaskhArabic-Marks.ttf` is a second subset of the same original with
the maddah, hamza and other marks U+0653-U+0658 and the modifier marks U+06DC, U+06E3, U+06E7 and U+06E8 added, for
the Arabic mark ordering tests (RM-59); the first file stays as it was, so its goldens keep their glyph ids.

| file                             | version | source (release asset, sha256 of the zip; font inside)                                                                                                                                                                                                   | sha256 of the original font                                        | sha256 of the subset                                               |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `NotoNaskhArabic-Regular.ttf`    | 2.021   | https://github.com/notofonts/arabic/releases/download/NotoNaskhArabic-v2.021/NotoNaskhArabic-v2.021.zip (`6c050ab9bd087d69b733c505a7576e60c528c2f33cd7b91005a5bd7da4514032`), `NotoNaskhArabic/unhinted/ttf/NotoNaskhArabic-Regular.ttf`                 | `c34fdbd98af4dbc45ca192a23d2eeb77032add83086f5fe32957d23b3f36b221` | `3bf5e21cbf32ddb0fca050e5259c37fa90ad70d2e7b0f4e050f442509a830329` |
| `NotoNaskhArabic-Marks.ttf`      | 2.021   | https://github.com/notofonts/arabic/releases/download/NotoNaskhArabic-v2.021/NotoNaskhArabic-v2.021.zip (`6c050ab9bd087d69b733c505a7576e60c528c2f33cd7b91005a5bd7da4514032`), `NotoNaskhArabic/unhinted/ttf/NotoNaskhArabic-Regular.ttf`                 | `c34fdbd98af4dbc45ca192a23d2eeb77032add83086f5fe32957d23b3f36b221` | `bd74ec640b73b2b0363e908a80c026eb1a6e5017fb29c9f868abe5b77a3b6f10` |
| `NotoSansDevanagari-Regular.ttf` | 2.007   | https://github.com/notofonts/devanagari/releases/download/NotoSansDevanagari-v2.007/NotoSansDevanagari-v2.007.zip (`820c7da45b1e63562cb41c0a8cac5d9a4202312043a3a040ed1325857ef469b1`), `NotoSansDevanagari/unhinted/ttf/NotoSansDevanagari-Regular.ttf` | `9c7d935139ea6a1e6ad9dbac4f6d27ece1e04bca8123c8888d00a0f9df4724cd` | `f4b173cf83db171ba5855f2e622eaa3480980852302bfa67bff78d7d1c0e9a09` |

`OFL-NotoNaskhArabic.txt` and `OFL-NotoSansDevanagari.txt` are the `OFL.txt` of each release zip (trailing spaces trimmed, as in `OFL.txt`). The
subsets were made with these commands (the same input gives the same bytes):

```sh
python -m fontTools.subset NotoNaskhArabic-Regular.ttf --unicodes="U+0020-007E,U+00A0,U+060C,U+061B,U+061F,U+0621-0652,U+0660-0669,U+0670-0671,U+067E,U+0686,U+06A9,U+06AF,U+06CC,U+200C-200F,U+25CC" --layout-features='*' --layout-scripts='*' --name-IDs='*' --name-languages='*' --name-legacy --notdef-outline --glyph-names --legacy-kern --output-file=NotoNaskhArabic-Regular.subset.ttf
python -m fontTools.subset NotoNaskhArabic-Regular.ttf --unicodes="U+0020-007E,U+00A0,U+060C,U+061B,U+061F,U+0621-0652,U+0653-0658,U+0660-0669,U+0670-0671,U+067E,U+0686,U+06A9,U+06AF,U+06CC,U+06DC,U+06E3,U+06E7-06E8,U+200C-200F,U+25CC" --layout-features='*' --layout-scripts='*' --name-IDs='*' --name-languages='*' --name-legacy --notdef-outline --glyph-names --legacy-kern --output-file=NotoNaskhArabic-Marks.ttf
python -m fontTools.subset NotoSansDevanagari-Regular.ttf --unicodes="U+0020-007E,U+00A0,U+0900-0914,U+0915,U+0917,U+091C,U+0924,U+0926,U+0928,U+092A,U+092E,U+092F,U+0930,U+0932,U+0935,U+0937,U+0938,U+0939,U+093C-094D,U+0950,U+0964-096F,U+200C-200D,U+25CC" --layout-features='*' --layout-scripts='*' --name-IDs='*' --name-languages='*' --name-legacy --notdef-outline --glyph-names --legacy-kern --output-file=NotoSansDevanagari-Regular.subset.ttf
```

None of the Noto fonts has Latin letters: the shaping goldens pair them with Montserrat for mixed text.
