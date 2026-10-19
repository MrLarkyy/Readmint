import { defineGoldenSuite } from "@readmint/golden";
import { loadLibraries } from "./librariesDesigns.js";
import {
  emptyRegistryData,
  longRegistryData,
  missingRegistryData,
  sampleRegistryData,
} from "./sampleRegistryData.js";
import { renderTemplate, withRootProps, type TemplateRender } from "./templateDesigns.js";

export default defineGoldenSuite<TemplateRender>({
  name: "libraries",
  render: renderTemplate,
  // Chromium and resvg place 13 px text a sub-pixel apart; the long card is mostly such text.
  browserTolerance: { maxDiffRatio: 0.02 },
  fonts: [
    "packages/components/templates/fonts/Montserrat-Medium.ttf",
    "packages/components/templates/fonts/Montserrat-ExtraBold.ttf",
  ],
  fixtures: [
    {
      name: "libraries-card-light",
      input: { design: loadLibraries("libraries-card"), data: sampleRegistryData() },
    },
    {
      name: "libraries-card-dark",
      input: {
        design: withRootProps(loadLibraries("libraries-card"), { theme: "dark" }),
        data: sampleRegistryData(),
      },
    },
    {
      name: "libraries-card-long",
      input: { design: loadLibraries("libraries-card"), data: longRegistryData() },
    },
    {
      name: "libraries-card-missing",
      input: {
        design: withRootProps(loadLibraries("libraries-card"), { theme: "dark" }),
        data: missingRegistryData(),
      },
    },
    {
      name: "libraries-card-empty",
      input: { design: loadLibraries("libraries-card"), data: emptyRegistryData() },
    },
  ],
});
