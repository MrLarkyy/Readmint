/**
 * One project of the "Shipped for" row of the example profiles: the name, the path data of its logo and the record
 * of where the logo came from. An empty `d` draws the name as text; a non-empty `d` is one monochrome path with its
 * origin at (0, 0), about 14 px tall, correct under the nonzero fill rule, and `source`, `retrieved`, `sha256`,
 * `licence` and `trademark` then say where it was taken and under which permission.
 */
export interface ProfileLogo {
  readonly name: string;
  readonly d: string;
  /** The official page the logo was looked for on (https), or `n/a: ...` where none could be found. */
  readonly source: string;
  /** ISO date of the check. */
  readonly retrieved: string;
  /** SHA-256 (64 hex digits) of the downloaded file, or `n/a: ...` where nothing was downloaded (empty `d`). */
  readonly sha256: string;
  /** The permission to redistribute the logo, or why none is committed. */
  readonly licence: string;
  /** The owner of the mark, or `unknown`. */
  readonly trademark: string;
}

const retrieved = "2026-10-16";
const notDownloaded = "n/a: not downloaded";

/** No logo is committed: for none was a licence found that allows redistributing it (see each entry). */
export const profileLogos: readonly ProfileLogo[] = [
  {
    name: "Hoplite",
    d: "",
    source: "https://hoplite.gg/",
    retrieved,
    sha256: notDownloaded,
    licence: "Not committed: the site is not readable (HTTP 403), no brand kit found.",
    trademark: "unknown",
  },
  {
    name: "Minebox",
    d: "",
    source: "https://minebox.co/legal",
    retrieved,
    sha256: notDownloaded,
    licence:
      "Not committed: the legal page forbids reproduction, and the logo on the site is a raster image.",
    trademark: "Qore Games",
  },
  {
    name: "Cobblemon Islands",
    d: "",
    source: "https://cobblemonislands.com/",
    retrieved,
    sha256: notDownloaded,
    licence: "Not committed: the logo on the site is a raster image and the site states no terms.",
    trademark: "unknown",
  },
  {
    name: "Mineclub",
    d: "",
    source: "n/a: mineclub.com does not resolve",
    retrieved,
    sha256: notDownloaded,
    licence: "Not committed: no official source of the logo was found.",
    trademark: "unknown",
  },
  {
    name: "SWN Moravia",
    d: "",
    source: "n/a: no site of SWN Moravia s.r.o. (company number 63493845) was found",
    retrieved,
    sha256: notDownloaded,
    licence: "Not committed: no official source of the logo was found.",
    trademark: "SWN Moravia s.r.o.",
  },
  {
    name: "we.builders",
    d: "",
    source: "https://we.builders/",
    retrieved,
    sha256: notDownloaded,
    licence:
      "Not committed: the header logo is a vector, but the site publishes no brand kit and no permission to reuse it.",
    trademark: "unknown",
  },
  {
    name: "Partners",
    d: "",
    source: "n/a: no official source was found for this name",
    retrieved,
    sha256: notDownloaded,
    licence: "Not committed: no official source of the logo was found.",
    trademark: "unknown",
  },
];
