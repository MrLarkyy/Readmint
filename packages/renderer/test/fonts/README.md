# Test fonts

Every font here may be redistributed; its licence sits beside it.

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

## Readmint Test Symbols (the repository's licence)

`ReadmintTestSymbols.ttf` (`0f3a4a3d308e30c619330ebe44e13cdd4217ed33a89321d2c0281efd0e43646e`) is made by this
repository and covered by the repository's own licence, like its code; it holds no third-party outlines or names.
`readmintTestSymbols()` in `packages/fonts/test/readmintTestSymbols.ts` builds it byte for byte (a test compares
them). It draws U+2605, U+25CF and U+1F536, which Montserrat lacks, so fallback and characters above the BMP
can be tested.
