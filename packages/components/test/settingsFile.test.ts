import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyDesignProps, parseDesignProps } from "@readmint/format";
import { profileExampleProps } from "@readmint/examples/props";
import { describe, expect, test } from "vitest";
import { profileTemplates, type ProfileTemplate } from "../src/index.js";
import { loadExampleProfile, loadProfile, type ProfileTheme } from "./profileDesigns.js";

const folders = join(import.meta.dirname, "..", "templates", "profiles");
const themes: readonly ProfileTheme[] = ["light", "dark"];
/** Root props that stay in the design: the theme variant and the slot (either file may set the slot). */
const notPersonal = new Set(["theme", "slot"]);

function settings(template: ProfileTemplate) {
  const result = parseDesignProps(readFileSync(join(folders, template, "settings.json"), "utf8"));
  if (!result.ok) throw new Error(`${template}/settings.json: ${JSON.stringify(result.issues)}`);
  return result.value;
}

describe.each(Object.keys(profileTemplates) as ProfileTemplate[])(
  "%s/settings.json",
  (template) => {
    const file = settings(template);

    test("names only sections of the template", () => {
      for (const section of Object.keys(file)) {
        expect(profileTemplates[template], section).toContain(section);
      }
    });

    test("covers every personal root prop of every section that has any, at its component default", () => {
      for (const section of profileTemplates[template]) {
        const design = loadProfile(template, section);
        const root = design.layers[0];
        if (root?.type !== "component")
          throw new Error(`${template}/${section}: no root component`);
        const declared = design.components?.[root.ref]?.props ?? {};
        const personal = Object.keys(declared).filter((name) => !notPersonal.has(name));
        if (personal.length === 0) {
          expect(file, section).not.toHaveProperty(section);
          continue;
        }
        expect(Object.keys(file[section] ?? {}).sort(), section).toEqual(personal.sort());
        for (const name of personal) {
          expect(file[section]?.[name], `${section}.${name}`).toEqual(declared[name]?.default);
        }
      }
    });

    test.each(themes)("applies to every section's %s design without an issue", (theme) => {
      for (const [section, props] of Object.entries(file)) {
        const result = applyDesignProps(loadProfile(template, section as never, theme), props);
        expect(result.ok, `${section} ${theme}`).toBe(true);
      }
    });

    test.each(themes)("takes the example texts for every section, %s", (theme) => {
      for (const section of profileTemplates[template]) {
        expect(() => loadExampleProfile(template, section, theme), section).not.toThrow();
      }
      for (const section of Object.keys(profileExampleProps[template] ?? {})) {
        expect(profileTemplates[template], section).toContain(section);
      }
    });
  },
);
