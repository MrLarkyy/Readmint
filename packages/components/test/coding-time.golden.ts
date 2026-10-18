import { defineGoldenSuite } from "@readmint/golden";
import { loadCodingTime } from "./codingTimeDesigns.js";
import { emptyWakaTimeData, longWakaTimeData, sampleWakaTimeData } from "./sampleWakaTimeData.js";
import { renderTemplate, withRootProps, type TemplateRender } from "./templateDesigns.js";

export default defineGoldenSuite<TemplateRender>({
  name: "coding-time",
  render: renderTemplate,
  // Chromium and resvg place 13 px text a sub-pixel apart; the long card is mostly such text (1.2 % of its pixels).
  browserTolerance: { maxDiffRatio: 0.02 },
  fonts: [
    "packages/components/templates/fonts/Montserrat-Medium.ttf",
    "packages/components/templates/fonts/Montserrat-ExtraBold.ttf",
  ],
  fixtures: [
    {
      name: "coding-time-card-light",
      input: { design: loadCodingTime("coding-time-card"), data: sampleWakaTimeData() },
    },
    {
      name: "coding-time-card-dark",
      input: {
        design: withRootProps(loadCodingTime("coding-time-card"), { theme: "dark" }),
        data: sampleWakaTimeData(),
      },
    },
    {
      name: "coding-time-card-long",
      input: { design: loadCodingTime("coding-time-card"), data: longWakaTimeData() },
    },
    {
      name: "coding-time-card-empty",
      input: {
        design: withRootProps(loadCodingTime("coding-time-card"), { theme: "dark" }),
        data: emptyWakaTimeData(),
      },
    },
  ],
});
