# Asset loading

A design names its fonts and images by relative paths (see [design-format.md](design-format.md#assets)); an image may
instead take its URL from data ([below](#images-bound-from-data)). The design
comes from a repository the CLI or the Action does not trust, so a path the format accepts is checked again when the
asset is loaded: it must name a regular file inside the design's folder, on Windows as on Linux.

The checks live in `@readmint/cli` (Node only, never imported by a package that runs in the browser):

- `checkAssetPath(src)`: the lexical rules below; returns the code of the first rule broken, or `undefined`.
- `resolveAsset(designDir, src)`: the lexical rules, then the filesystem: the real paths (symlinks, junctions, `subst`
  drives and 8.3 short names resolved) of the design folder and of the target must nest, and the target must be a
  regular file. Returns the real path and the file's identity (device and inode).
- `readAsset(designDir, src, { maxBytes })`: `resolveAsset`, then a bounded read (`readResolvedAsset` for an already
  resolved asset).

**Every relative asset the CLI or the Action loads is read through `readAsset`.** A refusal throws `AssetPathError` with
a stable `code` and the `src` as written; its message quotes only that source, never an absolute path or a Node error
message, since both can reach Action logs. The source is quoted by `quoteInput` of `@readmint/format` with the CLI's
escape set: at most 200 code points, and every control, format (bidi, zero-width), separator, private-use, unassigned
or surrogate code point escaped as `\uXXXX` (the set every line of the CLI is printed with, see [cli.md](cli.md#messages)).
A missing or unreadable design folder is the caller's error and is thrown as the Node error.

## Lexical rules

The same on every platform: a design refused on a Windows runner is refused on Linux, so a design never works in one
place and fails in another. A source is split at `/`; `.` and empty segments are allowed (they stay in the folder).

| code                    | refused                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `empty`                 | the empty string                                                                                     |
| `too-long`              | more than 1024 UTF-16 code units                                                                     |
| `absolute`              | a leading `/` or `\` (root, UNC), or a drive letter and colon (`C:/x.png`, drive-relative `c:x.png`) |
| `invalid-character`     | a control character (U+0000 to U+001F, U+007F), one of `\ : * ? " < > \|`, or an unpaired surrogate  |
| `parent-segment`        | a `..` segment                                                                                       |
| `trailing-dot-or-space` | a segment ending in `.` or a space (`a/.. /b.png`, `a/.../b.png`, `img.png.`)                        |
| `device-name`           | a segment naming a Windows device (`CON.png`, `a/nul.png`, `CON .png`, `COM¹.png`)                   |

`:` also opens NTFS alternate data streams (`img.png:stream`). Windows strips a trailing dot or space from a segment, so
`.. ` would open `..`. A segment names a device when its name up to the first `.`, trailing spaces ignored, in any letter
case, is `CON`, `PRN`, `AUX`, `NUL`, `CONIN$`, `CONOUT$`, `COM0` to `COM9`, `LPT0` to `LPT9`, or `COM`/`LPT` with a
superscript `¹`, `²` or `³`: Windows opens these as devices in any folder and with any extension.

`console.png`, `com10.png`, `.hidden.png` and `..foo.png` are allowed.

## Filesystem rules

| code         | refused                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `outside`    | the real path of the target is not inside the real path of the design folder (or is the folder itself) |
| `not-found`  | the target does not exist, including a dangling symlink or a symlink loop                              |
| `not-a-file` | the target is a directory, a FIFO, a device or anything else but a regular file                        |
| `unreadable` | any other filesystem error; the message names only its errno code (`EACCES`)                           |
| `too-large`  | the file is larger than `maxBytes`                                                                     |
| `changed`    | the opened file is not the one resolved (a file renamed over it, a symlink swapped in, removed)        |

Symlinks and junctions are followed: one that resolves inside the design folder is fine, one that leaves it is
`outside`. Containment compares path components (`path.relative`), so a sibling folder sharing the name as a prefix
(`design2` next to `design`) is outside.

`maxBytes` is required and has no default: the font and image loaders own their limits. It must be a positive safe
integer (else `RangeError`). The size is checked on the open file before reading, and the read never takes more than
`maxBytes + 1` bytes, so a file that grows meanwhile is still refused.

## Images bound from data

An image asset's `src` may be a `{{binding}}` (see [design-format.md](design-format.md#assets)), such as
`"{{ github.avatarUrl }}"`. The renderer never fetches: `fetchBoundImages(design, data, options)` of `@readmint/cli`
does it before the render and returns the bytes by asset id, which `loadRenderInput` hands to the renderer as
`RenderAssets.images`. The renderer then checks and inlines them like the bytes of a file asset, so the SVG is the same
as for a design whose asset is a file with those bytes. The CLI fetches only with `--fetch-images` (see
[cli.md](cli.md#options)); the Action always does, in both data modes (see [action.md](action.md#data-and-the-token)).

For every image asset whose `src` is a binding, used or not, ids in sorted order:

- The binding is evaluated against the root of the render data (never a repeat item) and must give a string.
- The URL must parse, be `https`, carry no user name, password or port, be at most 2048 characters, and its host name
  (lower case and punycode, as `URL` normalises it) must be exactly on the allow-list: `defaultImageHosts`
  (`avatars.githubusercontent.com`) unless `RemoteImageOptions.allowedHosts` says otherwise. A suffix
  (`avatars.githubusercontent.com.evil.example`), a sub-domain or a trailing dot does not match.
- The request is exactly `GET` with one header, `accept: image/png,image/jpeg,image/gif,image/webp`, `credentials:
"omit"` and `redirect: "error"`: no token, cookie or other credential is ever sent to an image host, and a redirect is
  refused rather than followed to a host nobody checked. It times out after 30 s (`RemoteImageLimits.timeoutMs`), body
  included.
- The body is refused once it is larger than the renderer's `maxImageBytes`, by the declared `content-length` first and
  then by the bytes streamed, so a lying header cannot make it buffer more. The type comes from the magic bytes, never
  the `content-type`: only PNG, JPEG, GIF and WebP pass (SVG never), within `maxImageSide` pixels per side and
  `maxAnimationFrames` frames.
- Each distinct URL is fetched once per `RemoteImageOptions.cache` (one per CLI run, preview rebuild or Action run),
  at most 32 URLs per cache (`RemoteImageLimits.maxUrls`); a failed URL keeps its error, so every design binding it fails
  the same way.

The first refusal throws `RemoteImageError` with the asset id and a stable `code`; the CLI and the Action print it as
`<design>: error <code> at /assets/images/<id>/src: <message>`. The message quotes the URL with the CLI's escape set
and never a request header or the text of a network error.

| code                | meaning                                                                                |
| ------------------- | -------------------------------------------------------------------------------------- |
| `image-binding`     | the binding does not evaluate, gives no string, or there is no data                    |
| `image-url`         | not a URL, not https, a user name, password or port in it, or over 2048 characters     |
| `image-host`        | the host is not on the allow-list                                                      |
| `image-fetch`       | network error, timeout, redirect, a status outside 200..299, or a 33rd URL in one run  |
| `image-too-large`   | over `maxImageBytes`, `maxImageSide` pixels per side or `maxAnimationFrames` frames    |
| `image-format`      | not a PNG, JPEG, GIF or WebP image                                                     |
| `image-not-fetched` | the design binds an image `src` and fetching is off (the CLI without `--fetch-images`) |

## Residual risks

- The file is opened by its real path with `O_NOFOLLOW` where the platform has it, and its device and inode are compared
  with those seen at resolve time. A folder on the path swapped for a link between resolving and opening is not
  detected; on Windows `O_NOFOLLOW` does not exist and only the identity check applies. The threat is hostile
  repository content, not a concurrent local attacker, so this race is accepted.
- A hard link inside the folder to a file outside is read: a hard link is a regular file. Git checkouts cannot carry hard
  links, so a repository cannot plant one.
- The design folder is trusted by its real path. If the folder itself is a link in an untrusted checkout, the boundary
  moves with it, so the callers must resolve the design file inside the workspace first: the CLI's `loadDesignFile`
  resolves it with `resolveAsset` inside `--root` (see [cli.md](cli.md#the-design-file-and-its-assets)); the Action
  loads every design through the same loader with the workspace as the root (see [action.md](action.md)).
- On Windows a symlink to a UNC path makes Windows contact that host while the path is resolved, before the link is
  refused as `outside`.
- `AssetPathError.src` is the raw value from the design. Callers print `error.message` (quoted and escaped), never `src`.
- Only paths are checked here; the bytes (format sniffing, dimensions, frames, font licence) are checked by the font and
  image loaders.
