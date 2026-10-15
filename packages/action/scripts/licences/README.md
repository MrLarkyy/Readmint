# Licence texts the Action bundle adds to a package's own

`scripts/licenceBanner.ts` appends these to the banner entry of the package named.

- `resvg-wasm.LICENSE` (`@resvg/resvg-wasm`, MPL-2.0): the package publishes no licence file. This is the MPL-2.0 text
  of the same project (`yisibl/resvg-js`), as `@resvg/resvg-js` ships it. Source: https://github.com/yisibl/resvg-js.
- `resvg-wasm-crates.txt` (`@resvg/resvg-wasm`): the Rust crates compiled into `resvg.wasm` with their licences and
  the licence texts. resvg-js commits no Cargo.lock, so the list was built from the crate source paths the
  WebAssembly binary itself names (exact versions) plus the crates resvg-js 2.6.2 and resvg 0.34 declare for the
  wasm32 build, licences from crates.io (2026-10-15). Regenerate it when `@resvg/resvg-wasm` changes version.
- `libwebp-COPYING`, `libwebp-PATENTS` (`wasm-webp`, MIT): `webp-wasm.wasm` is libwebp (BSD-3-Clause), built from
  webmproject/libwebp at 6c484cbf (v1.3.2 plus 135 commits); these are that release's `COPYING` and `PATENTS`.
