export type WikiGroupId = "start" | "guides" | "reference" | "contributors";

export interface WikiGroup {
  readonly id: WikiGroupId;
  /** Heading of the group in the sidebar and the Home page. */
  readonly title: string;
  /** One line under the group heading on the Home page. */
  readonly summary: string;
}

export interface WikiPage {
  /** File in docs/ the page is generated from. */
  readonly source: string;
  /** Wiki page name; GitHub serves it at /wiki/<name>. It is the URL of the page and never changes. */
  readonly name: string;
  /** Title shown in the sidebar and the Home page; the first heading of the source file says the same. */
  readonly title: string;
  readonly group: WikiGroupId;
  /** One line shown next to the page in the Home page index. */
  readonly summary: string;
}
