import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url));

test.each(["light", "dark"])(
  "the README Year Ring %s image is its golden byte for byte",
  (theme) => {
    const golden = read(`./golden/profiles-year-ring/year-${theme}.png`);
    const image = read(`../../../assets/readme/year-ring-${theme}.png`);
    expect(image.equals(golden)).toBe(true);
  },
);
