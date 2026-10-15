/** What the editor read from a font's own bytes: whether its OS/2 fsType lets it be embedded. */
export interface FontCheck {
  readonly fsType: number;
  readonly embeddable: boolean;
}
