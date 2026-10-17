import type { AnimationTrack, Design, Layer, LayerAnimation } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { renderSvg, type RenderOptions } from "../src/index.js";
import { animationDesigns } from "./animationDesigns.js";
import { renderFixture } from "./renderFixture.js";

/** The design with `cycles: 1` written on every track that has none. */
function withOneCycle(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withOneCycle);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key !== "animate" || typeof entry !== "object" || entry === null)
        return [key, withOneCycle(entry)];
      const tracks = Object.entries(entry as Record<string, object>).map(([property, track]) => [
        property,
        "cycles" in track ? track : { ...track, cycles: 1 },
      ]);
      return [key, Object.fromEntries(tracks)];
    }),
  );
}

function animated(layers: Layer[], loop = true): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 100 },
    animation: { duration: 1000, loop },
    layers,
  };
}

function svgOf(design: Design, options: RenderOptions = {}): string {
  const result = renderSvg(design, options);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

const opacities = (svg: string) =>
  [...svg.matchAll(/ opacity="([\d.]+)"/gu)].map((match) => Number(match[1]));

describe("cycles (RM-143)", () => {
  test.each(
    animationDesigns
      .filter(({ name }) => name !== "cycles")
      .map(({ name, input, times }) => [name, input, times] as const),
  )("%s draws the same bytes with cycles: 1 on every track", (_name, input, times) => {
    const once = { ...input, design: withOneCycle(input.design) as Design };
    expect(once.design).not.toEqual(input.design);
    for (const time of [undefined, ...times]) {
      const at = time === undefined ? {} : { time };
      expect(renderFixture({ ...once, ...at })).toBe(renderFixture({ ...input, ...at }));
    }
  });

  test("a run past the timeline is cut there and warned once, over every copy", () => {
    const design = animated(
      [
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{ [0, 1, 2] }}" },
          animate: {
            opacity: {
              keyframes: [
                { offset: 0, value: 0 },
                { offset: 1, value: 1 },
              ],
              duration: 300,
              cycles: 4,
            },
          },
        },
      ],
      false,
    );
    const result = renderSvg(design);
    expect(result.ok && result.warnings).toEqual([
      {
        path: "/layers/0/animate/opacity",
        code: "animation-cut",
        message: "the track runs past the end of the 1000 ms timeline and is cut there",
      },
    ]);
    // the fourth cycle starts at 900 ms: a third of it fits
    expect(opacities(svgOf(design, { time: 1000 }))).toEqual([0.333, 0.333, 0.333]);
  });

  test("a stagger shifts the whole run of a copy, every cycle of it", () => {
    const design = animated([
      {
        type: "rect",
        width: 1,
        height: 1,
        repeat: { each: "{{ [0, 1] }}" },
        animate: {
          opacity: {
            keyframes: [
              { offset: 0, value: 0 },
              { offset: 1, value: 1 },
            ],
            duration: 100,
            stagger: 250,
            cycles: 2,
          },
        },
      },
    ]);
    const at = (time: number) => opacities(svgOf(design, { time }));
    expect(at(50)).toEqual([0.5, 0]);
    expect(at(150)).toEqual([0.5, 0]);
    expect(at(300)).toEqual([1, 0.5]);
    expect(at(400)).toEqual([1, 0.5]);
    expect(at(500)).toEqual([1, 1]);
  });

  /** One cycle of `values` at even offsets over 250 ms, played four times on a 1000 ms timeline. */
  function cycled(values: readonly number[], easing?: AnimationTrack<number>["easing"]) {
    return {
      keyframes: values.map((value, index) => ({ offset: index / (values.length - 1), value })),
      duration: 250,
      cycles: 4,
      ...(easing === undefined ? {} : { easing }),
    };
  }

  /** The same four cycles written out by hand, a jump written as two keyframes at one offset. */
  function unrolled(
    keyframes: readonly { offset: number; value: number }[],
    easing?: AnimationTrack<number>["easing"],
  ) {
    return { keyframes, duration: 1000, ...(easing === undefined ? {} : { easing }) };
  }

  test("a cycles track draws the bytes of its hand-unrolled twin, animated and in frames", () => {
    const bounce = [0, 1, 0];
    const eighths = Array.from({ length: 9 }, (_, index) => ({
      offset: index / 8,
      value: index % 2 === 0 ? 0 : 1,
    }));
    const quarters = [0, 1, 2, 3].flatMap((index) => [
      { offset: index / 4, value: 1 },
      { offset: (index + 1) / 4, value: 0.2 },
    ]);
    const layer = (animate: LayerAnimation): Layer => ({
      type: "rect",
      width: 10,
      height: 10,
      animate,
    });
    const short = animated([
      layer({
        y: cycled(
          bounce.map((value) => value * -20),
          "ease-in-out",
        ),
      }),
      layer({ opacity: cycled([1, 0.2]) }),
    ]);
    const long = animated([
      layer({
        y: unrolled(
          eighths.map(({ offset, value }) => ({ offset, value: value * -20 })),
          "ease-in-out",
        ),
      }),
      layer({ opacity: unrolled(quarters) }),
    ]);
    expect(svgOf(short)).toBe(svgOf(long));
    for (const time of [0, 125, 250, 300, 999, 1000])
      expect(svgOf(short, { time })).toBe(svgOf(long, { time }));
  });
});
