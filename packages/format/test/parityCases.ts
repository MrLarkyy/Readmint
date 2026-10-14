import everyLayerKindJson from "./fixtures/valid/every-layer-kind.design.json?raw";
import everyLayerKindYaml from "./fixtures/valid/every-layer-kind.design.yaml?raw";
import animationJson from "./fixtures/valid/animation.design.json?raw";
import offsetOrder from "./fixtures/invalid/semantic-animation-offset-order.design.json?raw";
import severalIssues from "./fixtures/invalid/several-issues-in-order.design.json?raw";

/** Inputs and pinned results shared by the Node and the Chromium parity tests. */
export const parityCases = [
  { name: "every-layer-kind json", source: everyLayerKindJson },
  { name: "every-layer-kind yaml", source: everyLayerKindYaml },
  { name: "several issues", source: severalIssues },
  { name: "animation json", source: animationJson },
  { name: "animation offset order", source: offsetOrder },
] as const;

export const pinnedResults: Readonly<Record<(typeof parityCases)[number]["name"], unknown>> = {
  "every-layer-kind json": { ok: true, value: JSON.parse(everyLayerKindJson) as unknown },
  "every-layer-kind yaml": { ok: true, value: JSON.parse(everyLayerKindJson) as unknown },
  "several issues": {
    ok: false,
    truncated: false,
    issues: [
      {
        path: "/layers/0/fill",
        code: "pattern",
        message:
          '"#ggg" is not a colour (#rgb, #rgba, #rrggbb or #rrggbbaa), "none", a {{binding}} or a gradient',
      },
      { path: "/layers/0/opacity", code: "range", message: "must be between 0 and 1" },
      {
        path: "/layers/1/children",
        code: "missing-property",
        message: 'missing required property "children"',
      },
      { path: "/title", code: "type", message: "expected a title" },
    ],
  },
  "animation json": { ok: true, value: JSON.parse(animationJson) as unknown },
  "animation offset order": {
    ok: false,
    truncated: false,
    issues: [
      {
        path: "/layers/0/children/0/animate/fill/keyframes/2/offset",
        code: "range",
        message: "keyframe offsets must not decrease: 0.4 follows 0.6",
      },
    ],
  },
};
