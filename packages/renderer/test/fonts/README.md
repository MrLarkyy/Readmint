# Test fonts

Every font here may be redistributed under the SIL Open Font License 1.1; the licence text, `OFL.txt`, sits beside
them.

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
