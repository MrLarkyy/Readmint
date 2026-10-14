import type { AnimationTrack, Design, Layer } from "@readmint/format";
import { describe, expect, test } from "vitest";
import { frameTimes, renderSvg, type RenderOptions } from "../src/index.js";
import { animationDesigns } from "./animationDesigns.js";
import { renderFixture } from "./renderFixture.js";
import components from "./renderer-components.golden.js";
import images from "./renderer-images.golden.js";
import layout from "./renderer-layout.golden.js";
import shapes from "./renderer-shapes.golden.js";
import text from "./renderer-text.golden.js";

function track(from: unknown, to: unknown, extra: Record<string, unknown> = {}) {
  return {
    keyframes: [
      { offset: 0, value: from },
      { offset: 1, value: to },
    ],
    ...extra,
    // Values are checked at render time; `never` lets one helper build tracks of any property.
  } as AnimationTrack<never>;
}

/** `null`: a design without a timeline. */
function animated(
  layers: Layer[],
  animation: Design["animation"] | null = { duration: 1000 },
): Design {
  return {
    version: 0,
    canvas: { width: 100, height: 100 },
    ...(animation === null ? {} : { animation }),
    layers,
  };
}

function svgOf(design: Design, options: RenderOptions = {}): string {
  const result = renderSvg(design, options);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.svg;
}

/** The animated SVG without what only plays in a browser: its classes and its animation rules. */
function withoutCss(svg: string): string {
  return svg
    .replace(/ class="a\d+"/gu, "")
    .replace(
      /@keyframes k\d+\{(?:[^{}]*\{[^{}]*\})*\}|\.a\d+\{[^{}]*\}|@media[^{}]*\{[^{}]*\{[^{}]*\}\}/gu,
      "",
    )
    .replace("<defs><style></style></defs>", "");
}

const designs = animationDesigns.map(({ name, input }) => [name, input] as const);

describe("frames and the animated SVG", () => {
  test.each(
    [shapes, layout, text, images, components].flatMap((suite) =>
      suite.fixtures.map((fixture) => [`${suite.name}/${fixture.name}`, fixture.input] as const),
    ),
  )("%s has no animation and draws the same bytes at any time", (_name, input) => {
    const still = renderFixture(input);
    for (const time of [0, 250.5, 86_400_000])
      expect(renderFixture({ ...input, time })).toBe(still);
  });

  test.each(designs)("the static attributes of %s are its frame at time 0", (_name, input) => {
    const svg = renderFixture(input);
    expect(withoutCss(svg)).toBe(renderFixture({ ...input, time: 0 }));
    expect(svg).toMatch(/@keyframes k0\{/u);
  });

  test.each(designs)("a frame of %s holds no class and no animation CSS", (_name, input) => {
    const frame = renderFixture({ ...input, time: 300 });
    expect(frame).not.toMatch(/class=|@keyframes|animation|@media/u);
  });

  test("a looping timeline starts over, one that does not loop holds its end", () => {
    const layers: Layer[] = [
      { type: "rect", width: 10, height: 10, animate: { x: track(0, 50), opacity: track(1, 0) } },
    ];
    const loop = animated(layers);
    expect(svgOf(loop, { time: 1100 })).toBe(svgOf(loop, { time: 100 }));
    expect(svgOf(loop, { time: 1000 })).toBe(svgOf(loop, { time: 0 }));
    const once = animated(layers, { duration: 1000, loop: false });
    expect(svgOf(once, { time: 2000 })).toBe(svgOf(once, { time: 1000 }));
    expect(svgOf(once, { time: 1000 })).toContain('transform="translate(50 0)"');
    expect(svgOf(once)).toContain("animation:k0 1000ms linear both}");
    expect(svgOf(loop)).toContain("animation:k0 1000ms linear infinite}");
  });

  test("a design without a timeline ignores animate", () => {
    const layer: Layer = { type: "rect", width: 10, height: 10 };
    const plain = svgOf(animated([layer], null));
    const withTracks = { ...layer, animate: { opacity: track(0, 1) } } as Layer;
    expect(svgOf(animated([withTracks], null))).toBe(plain);
    expect(svgOf(animated([withTracks], null), { time: 300 })).toBe(plain);
  });

  test("the animated SVG has no script, SMIL or url() and stops under reduced motion", () => {
    for (const [, input] of designs) {
      const svg = renderFixture(input);
      expect(svg).not.toMatch(/<script|<animate|<set |onbegin|url\((?!#|data:font)/u);
      expect(svg.match(/prefers-reduced-motion/gu)).toHaveLength(1);
      expect(svg).toContain("@media (prefers-reduced-motion:reduce){*{animation:none!important}}");
    }
  });

  test("transforms turn around the box centre without touching the element's own transform", () => {
    const svg = svgOf(
      animated([
        {
          type: "rect",
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          rotation: 15,
          animate: { scale: track(0.5, 1), rotation: track(0, 90), x: track(0, 5) },
        },
      ]),
      { time: 0 },
    );
    expect(svg).toContain(
      '<g transform="translate(25 40)"><g transform="translate(0 0)"><g transform="rotate(0)"><g transform="scale(0.5)"><rect x="-15" y="-20" width="30" height="40" transform="rotate(15 0 0)"/></g></g></g></g>',
    );
  });

  test("x and y alone need no centre groups", () => {
    const svg = svgOf(
      animated([{ type: "ellipse", width: 4, height: 4, animate: { y: track(0, 8) } }]),
      { time: 500 },
    );
    expect(svg).toContain('<g transform="translate(0 4)"><ellipse cx="2" cy="2"');
  });
});

describe("timing", () => {
  test("a copy starts at delay + stagger x its repeat index", () => {
    const svg = svgOf(
      animated([
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{[1, 2, 3]}}" },
          animate: { opacity: track(0, 1, { delay: 50, stagger: 100, duration: 100 }) },
        },
      ]),
    );
    expect(svg).toContain("@keyframes k0{0%,5%{opacity:0}15%,100%{opacity:1}}");
    expect(svg).toContain("@keyframes k1{0%,15%{opacity:0}25%,100%{opacity:1}}");
    expect(svg).toContain("@keyframes k2{0%,25%{opacity:0}35%,100%{opacity:1}}");
  });

  test("a bound delay staggers nested repeats", () => {
    const svg = svgOf(
      animated([
        {
          type: "group",
          repeat: { each: "{{[0, 1]}}", as: "week" },
          children: [
            {
              type: "rect",
              width: 1,
              height: 1,
              repeat: { each: "{{[0, 1]}}", as: "day" },
              animate: {
                opacity: track(0, 1, { delay: "{{(week * 2 + day) * 100}}", duration: 100 }),
              },
            },
          ],
        },
      ]),
      { time: 250 },
    );
    expect([...svg.matchAll(/opacity="([\d.]+)"/gu)].map((match) => match[1])).toEqual([
      "1",
      "1",
      "0.5",
      "0",
    ]);
  });

  test("a track past the timeline end is cut there, warned once per track, the same in both outputs", () => {
    const design = animated(
      [
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{[0, 1, 2, 3, 4]}}" },
          animate: { opacity: track(0, 1, { stagger: 300, duration: 400 }) },
        },
      ],
      { duration: 1000, loop: false },
    );
    const result = renderSvg(design);
    expect(result.ok && result.warnings).toEqual([
      {
        path: "/layers/0/animate/opacity",
        code: "animation-cut",
        message: "the track runs past the end of the 1000 ms timeline and is cut there",
      },
    ]);
    const svg = result.ok ? result.svg : "";
    // Copy 3 starts at 900 ms: a quarter of its track fits; copy 4 starts after the end and holds its first value.
    expect(svg).toContain("@keyframes k3{0%,90%{opacity:0}100%{opacity:0.25}}");
    expect(svg).toContain("@keyframes k4{0%,100%{opacity:0}}");
    const end = svgOf(design, { time: 1000 });
    expect([...end.matchAll(/opacity="([\d.]+)"/gu)].map((match) => match[1])).toEqual([
      "1",
      "1",
      "1",
      "0.25",
      "0",
    ]);
  });

  test("keyframes at the same time keep their order one step apart", () => {
    const jump = {
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 0.5, value: 0 },
        { offset: 0.5, value: 1 },
        { offset: 1, value: 1 },
      ],
    };
    const svg = svgOf(
      animated([{ type: "rect", width: 1, height: 1, animate: { opacity: jump } }]),
    );
    expect(svg).toContain("@keyframes k0{0%,50%{opacity:0}50.001%,100%{opacity:1}}");
  });

  test("identical copies share one @keyframes and one class", () => {
    const svg = svgOf(
      animated([
        {
          type: "rect",
          width: 1,
          height: 1,
          repeat: { each: "{{items}}" },
          animate: { opacity: track(0, 1), fill: track("#000", "#fff") },
        },
      ]),
      { data: { items: new Array<number>(371).fill(0) } },
    );
    expect(svg.match(/@keyframes/gu)).toHaveLength(1);
    expect(svg.match(/\.a\d+\{/gu)).toHaveLength(1);
    expect(svg.match(/ class="a0"/gu)).toHaveLength(371);
  });

  test("a colour track with alpha also animates the paint opacity", () => {
    const svg = svgOf(
      animated([
        {
          type: "rect",
          width: 1,
          height: 1,
          fill: "#ff000080",
          animate: { stroke: track("#00000000", "#ffffff") },
        },
      ]),
    );
    expect(svg).toContain(
      "@keyframes k0{0%{stroke:#000000;stroke-opacity:0}100%{stroke:#ffffff;stroke-opacity:1}}",
    );
    expect(svg).toContain(
      'fill="#ff0000" fill-opacity="0.502" stroke="#000000" stroke-opacity="0"',
    );
  });

  test("easing overshoot moves transforms past their keyframes but clamps opacity", () => {
    const overshoot = { easing: { x1: 0.2, y1: 2, x2: 0.4, y2: 2 } };
    const svg = svgOf(
      animated([
        {
          type: "rect",
          width: 1,
          height: 1,
          animate: { opacity: track(0, 1, overshoot), x: track(0, 10, overshoot) },
        },
      ]),
      { time: 500 },
    );
    expect(svg).toContain('opacity="1"');
    const x = Number(/translate\(([\d.]+) 0\)/u.exec(svg)?.[1]);
    expect(x).toBeGreaterThan(10);
  });

  test("a stroke is drawn on with a dash longer than the path", () => {
    const svg = svgOf(
      animated([
        {
          type: "path",
          d: "M0 0 L30 40 h-30 z",
          stroke: "#000",
          animate: { draw: track(0, 1) },
        },
      ]),
      { time: 250 },
    );
    // 50 + 30 + 40 = 120, dash = ceil3(120 * 1.01 + 1) = 122.2; a quarter drawn.
    expect(svg).toContain('stroke-dasharray="122.2 122.2" stroke-dashoffset="91.65"');
  });

  test("every layer kind takes opacity and transforms; a track its kind cannot take is not drawn", () => {
    const common = { opacity: track(0, 1), scale: track(1, 2) };
    const design: Design = {
      ...animated([
        { type: "group", children: [], animate: common },
        { type: "component", ref: "c", animate: common },
        { type: "image", asset: "i", width: 1, height: 1, animate: common },
        { type: "rect", width: 1, height: 1, animate: { draw: track(0, 1) } } as Layer,
      ]),
      assets: {
        images: { i: { src: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=" } },
      },
      components: { c: { layers: [] } },
    };
    const svg = svgOf(design);
    expect(svg.match(/<g transform="translate\([^)]*\)"><g class=/gu)).toHaveLength(3);
    expect(svg).toContain('<rect x="0" y="0" width="1" height="1"/>');
  });
});

describe("issues", () => {
  test.each([NaN, -1, 1e12, Infinity, "5" as unknown as number])(
    "time %s fails with range at the root",
    (time) => {
      const result = renderSvg(animated([]), { time });
      expect(result).toMatchObject({ ok: false, issues: [{ path: "", code: "range" }] });
    },
  );

  test("a bound keyframe value outside its range fails with range, a string with type", () => {
    const layer = (value: string): Layer => ({
      type: "rect",
      width: 1,
      height: 1,
      animate: { scale: track(1, value) },
    });
    expect(renderSvg(animated([layer("{{200}}")]))).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/scale/keyframes/1/value", code: "range" }],
    });
    expect(renderSvg(animated([layer('{{"big"}}')]))).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/scale/keyframes/1/value", code: "type" }],
    });
  });

  test("a bound colour that is no colour fails with type", () => {
    const layer: Layer = {
      type: "rect",
      width: 1,
      height: 1,
      animate: {
        fill: {
          keyframes: [
            { offset: 0, value: "#000" },
            { offset: 1, value: "{{c}}" },
          ],
        },
      },
    };
    expect(renderSvg(animated([layer]), { data: { c: "red" } })).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/fill/keyframes/1/value", code: "type" }],
    });
  });

  test("unvalidated decreasing offsets fail with range", () => {
    const backwards = {
      keyframes: [
        { offset: 0.5, value: 0 },
        { offset: 0.2, value: 1 },
      ],
    };
    expect(
      renderSvg(animated([{ type: "rect", width: 1, height: 1, animate: { x: backwards } }])),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/x/keyframes/1/offset", code: "range" }],
    });
  });

  test("easing or keyframes from an unvalidated design never reach the CSS as text", () => {
    const hostile = (track: unknown): Design =>
      animated([{ type: "rect", width: 1, height: 1, animate: { opacity: track } } as Layer]);
    expect(
      renderSvg(hostile({ ...track(0, 1), easing: "linear}</style><script>alert(1)</script>" })),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/opacity/easing", code: "type" }],
    });
    expect(
      renderSvg(hostile({ ...track(0, 1), easing: { x1: "0", y1: 0, x2: 1, y2: 1 } })),
    ).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/opacity/easing/x1", code: "type" }],
    });
    expect(renderSvg(hostile({ keyframes: "0,1" }))).toMatchObject({
      ok: false,
      issues: [{ path: "/layers/0/animate/opacity/keyframes", code: "type" }],
    });
    const many = Array.from({ length: 33 }, (_, index) => ({ offset: index / 32, value: 0 }));
    expect(renderSvg(hostile({ keyframes: many }))).toMatchObject({ ok: false });
  });

  test("the report names the timeline", () => {
    const result = renderSvg(animated([], { duration: 800, loop: false }));
    expect(result.ok && result.report.animation).toEqual({ duration: 800, loop: false });
    const still = renderSvg(animated([], null));
    expect(still.ok && "animation" in still.report).toBe(false);
  });
});

describe("frameTimes", () => {
  test("a looping timeline leaves out its end, which equals time 0", () => {
    expect(frameTimes({ duration: 1000 }, 4)).toEqual([0, 250, 500, 750]);
    expect(frameTimes({ duration: 1000, loop: true }, 3)).toEqual([0, 1000 / 3, 2000 / 3]);
  });

  test("a timeline that does not loop ends with its held last frame", () => {
    expect(frameTimes({ duration: 1000, loop: false }, 4)).toEqual([0, 250, 500, 750, 1000]);
    expect(frameTimes({ duration: 100, loop: false }, 1)).toEqual([0, 100]);
  });

  test("60 frames per second over the longest timeline", () => {
    expect(frameTimes({ duration: 60_000 }, 60)).toHaveLength(3600);
  });

  test.each([
    [{ duration: 0 }, 10],
    [{ duration: 1.5 }, 10],
    [{ duration: 60_001 }, 10],
    [{ duration: 1000 }, 0.5],
    [{ duration: 1000 }, 61],
    [{ duration: 1000 }, NaN],
  ])("%j at %d frames per second is a RangeError", (animation, rate) => {
    expect(() => frameTimes(animation, rate)).toThrow(RangeError);
  });
});
