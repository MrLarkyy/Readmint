import type { Design } from "@readmint/format";

/** A design with one root component prop, `color`, the fill of a rect. */
export const settingsDesign: Design = {
  version: 0,
  canvas: { width: 200, height: 60 },
  components: {
    card: {
      props: { color: { type: "string", default: "#000000" } },
      layers: [{ type: "rect", width: 20, height: 20, fill: "{{ props.color }}" }],
    },
  },
  layers: [{ type: "component", ref: "card" }],
};

export const settingsText = JSON.stringify({
  header: { color: "#ff0000" },
  other: { color: "#00ff00" },
  broken: { missing: "s3cret-value" },
});
