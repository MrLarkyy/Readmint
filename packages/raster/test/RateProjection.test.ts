import { describe, expect, test } from "vitest";
import { RasterError } from "../src/RasterError.js";
import { RateProjection } from "../src/RateProjection.js";

const tooLarge = new RasterError("raster-output-too-large", "too big");

describe("RateProjection", () => {
  test("names the rate from the bytes after the first frame, 30 percent short of the limit", () => {
    const projection = new RateProjection(1000, 20, 1000);
    projection.written(100, 50);
    // 100 bytes of head, 400 more over 450 ms: 1000 ms need 100 + 400 * 950 / 450 = 944 bytes; 700 - 100 = 600 of room.
    const error = projection.explain(tooLarge, 500, 500);
    expect(error).toBeInstanceOf(RasterError);
    expect((error as RasterError).message).toBe("too big (about 14 fps fits at this size)");
    expect((error as RasterError).code).toBe("raster-output-too-large");
  });

  test.each([
    ["another error", new Error("x"), 500, 500],
    ["another code", new RasterError("raster-image", "x"), 500, 500],
    ["a failure on the first frame", tooLarge, 100, 50],
    ["a rate below 1", tooLarge, 100_000, 500],
  ])("passes %s through", (_name, error, bytes, covered) => {
    const projection = new RateProjection(1000, 20, 1000);
    projection.written(100, 50);
    expect(projection.explain(error, bytes, covered)).toBe(error);
  });

  test("names nothing before a first frame was written", () => {
    expect(new RateProjection(1000, 20, 1000).explain(tooLarge, 500, 500)).toBe(tooLarge);
  });
});
