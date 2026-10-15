export interface WikiPage {
  /** File in docs/ the page is generated from. */
  readonly source: string;
  /** Wiki page name; GitHub shows it as the title and serves it at /wiki/<name>. */
  readonly name: string;
  /** One line shown next to the page in the Home page index. */
  readonly summary: string;
}
