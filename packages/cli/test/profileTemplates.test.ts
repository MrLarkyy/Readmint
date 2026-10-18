import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { profileTemplates } from "../../components/src/index.js";
import { sampleProfileData } from "../../components/test/sampleProfileData.js";
import { stripFontData } from "../../components/test/stripFontData.js";
import { ExitCode, runCli } from "../src/index.js";

// The profile templates of @readmint/components are read from disk as a user does, without the package depending on it.
const components = join(import.meta.dirname, "..", "..", "components");
const folders = join(components, "templates", "profiles");
const templates = Object.keys(profileTemplates) as (keyof typeof profileTemplates)[];

const scratch: string[] = [];
afterAll(async () => {
  await Promise.all(scratch.map((folder) => rm(folder, { recursive: true, force: true })));
});

async function run(argv: readonly string[], cwd = components) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(argv, {
    cwd,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
  });
  return { code, stdout, stderr };
}

test("the folders hold the profile templates", () => {
  expect(readdirSync(folders).sort()).toEqual(Object.keys(profileTemplates).sort());
});

// The golden render passes the font bytes itself; the CLI path reads the manifest, resolves the relative `src` of the
// fonts and applies the entry's props and the dark variant, and must give the same SVG.
describe.each(templates)("%s renders.json from disk", (template) => {
  const manifest = join(folders, template, "renders.json");
  const golden = (name: string, theme: "light" | "dark") =>
    readFile(
      join(components, "test", "golden", `profiles-${template}-svg`, `${name}-${theme}.svg`),
      "utf8",
    );

  async function renderTo(extra: readonly string[] = []) {
    const out = await mkdtemp(join(tmpdir(), "readmint-profile-"));
    scratch.push(out);
    await writeFile(join(out, "data.json"), JSON.stringify(sampleProfileData()));
    const result = await run(
      ["render", "--manifest", manifest, "--out-dir", "svg", "--data", "data.json", ...extra],
      out,
    );
    return { out: join(out, "svg"), result };
  }

  test("writes every render as its golden, light and dark, the same bytes twice", async () => {
    const first = await renderTo();
    expect(first.result).toMatchObject({ code: ExitCode.ok, stderr: "" });
    const files = (await readdir(first.out)).sort();
    expect(files).toEqual(
      profileTemplates[template].flatMap((name) => [`${name}.dark.svg`, `${name}.svg`]).sort(),
    );
    for (const name of profileTemplates[template]) {
      expect(stripFontData(await readFile(join(first.out, `${name}.svg`), "utf8")), name).toBe(
        await golden(name, "light"),
      );
      expect(
        stripFontData(await readFile(join(first.out, `${name}.dark.svg`), "utf8")),
        `${name} dark`,
      ).toBe(await golden(name, "dark"));
    }
    const second = await renderTo();
    expect(second.result.stdout).toBe(first.result.stdout);
    for (const file of files) {
      expect(await readFile(join(second.out, file), "utf8"), file).toBe(
        await readFile(join(first.out, file), "utf8"),
      );
    }
  });

  test("with the template's settings the bytes are those of the defaults", async () => {
    const plain = await renderTo();
    const settings = await renderTo(["--props", join(folders, template, "settings.json")]);
    expect(settings.result).toMatchObject({ code: ExitCode.ok, stderr: "" });
    for (const file of await readdir(plain.out)) {
      expect(await readFile(join(settings.out, file), "utf8"), file).toBe(
        await readFile(join(plain.out, file), "utf8"),
      );
    }
  });
});
