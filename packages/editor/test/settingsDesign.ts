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

/** A design whose root component declares the enum prop `theme` (and `w`), as a design with a dark variant does. */
export const themeDesign: Design = {
  version: 0,
  canvas: { width: 40, height: 24 },
  components: {
    box: {
      props: {
        theme: { type: "enum", values: ["light", "dark"], default: "light" },
        w: { type: "number", default: 5 },
      },
      layers: [
        {
          type: "rect",
          width: "{{ props.w }}",
          height: 10,
          fill: '{{ props.theme == "dark" ? "#000000" : "#ffffff" }}',
        },
      ],
    },
  },
  layers: [{ type: "component", ref: "box" }],
};

/** `themeDesign` whose `theme` has no `dark` value, so the dark variant does not fit. */
export const noDarkDesign: Design = {
  ...themeDesign,
  components: {
    box: {
      ...themeDesign.components?.["box"],
      props: {
        theme: { type: "enum", values: ["light", "night"], default: "light" },
        w: { type: "number", default: 5 },
      },
      layers: themeDesign.components?.["box"]?.layers ?? [],
    },
  },
};
