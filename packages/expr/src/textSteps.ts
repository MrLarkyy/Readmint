/** Units of text one budget step pays for when a filter or an operator walks or builds a string. */
const unitsPerStep = 16;

export function textSteps(length: number): number {
  return 1 + Math.floor(length / unitsPerStep);
}
