/** The part of a design's animation that decides which frames a raster export samples. */
export interface Timeline {
  readonly duration: number;
  readonly loop: boolean;
}
