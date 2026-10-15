import { defineGoldenSuite } from "@readmint/golden";
import { starterTemplates } from "../src/index.js";
import { sampleGitHubData, worstCaseGitHubData } from "./sampleGitHubData.js";
import {
  loadStarter,
  renderTemplate,
  withRootProps,
  type TemplateRender,
} from "./templateDesigns.js";

const data = sampleGitHubData();

export default defineGoldenSuite<TemplateRender>({
  name: "templates",
  render: renderTemplate,
  fonts: [
    "packages/components/templates/fonts/Montserrat-Medium.ttf",
    "packages/components/templates/fonts/Montserrat-ExtraBold.ttf",
  ],
  fixtures: [
    ...starterTemplates.flatMap((name) => [
      { name: `${name}-light`, input: { design: loadStarter(name), data } },
      {
        name: `${name}-dark`,
        input: { design: withRootProps(loadStarter(name), { theme: "dark" }), data },
      },
    ]),
    {
      name: "banner-multiline",
      input: {
        design: loadStarter("banner"),
        data: {
          github: {
            ...data.github,
            bio: ["Line one", "Line two", "Line three", "Line four", "Line five"].join("\n"),
          },
        },
      },
    },
    ...(["stats-card", "banner", "language-bars", "profile-card"] as const).map((name) => ({
      name: `${name}-long`,
      input: { design: loadStarter(name), data: worstCaseGitHubData() },
    })),
  ],
});
