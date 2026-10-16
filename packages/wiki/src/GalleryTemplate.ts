export interface GalleryTemplate {
  /** Template name: the folder under templates/profiles/ or the starter or calendar design file name. */
  readonly name: string;
  readonly title: string;
  readonly kind: "profile" | "starter" | "calendar";
  /** One line, from the "look" column of docs/components.md. */
  readonly description: string;
  /** Section names of a profile, or [name] for a starter or a calendar; each has a light and a dark golden. */
  readonly items: readonly string[];
}
