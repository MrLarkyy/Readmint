export interface GalleryTemplate {
  /** Template name: the folder under templates/profiles/ or the starter, calendar or source card design file name. */
  readonly name: string;
  readonly title: string;
  readonly kind: "profile" | "starter" | "calendar" | "source";
  /** One line, from the "look" column of docs/components.md. */
  readonly description: string;
  /** Section names of a profile, or [name] for a starter, a calendar or a source card; each has a light and a dark golden. */
  readonly items: readonly string[];
  /** Source cards only: the folder under test/golden holding `<item>-light.png` and `<item>-dark.png`. */
  readonly folder?: string;
}
