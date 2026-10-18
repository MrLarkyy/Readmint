import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assertActionSupportsDesigns } from "../src/assertActionSupportsDesigns.js";
import { buildExamples, profileExampleProps, runExamples } from "../src/index.js";

const templatesDir = fileURLToPath(new URL("../../components/templates/", import.meta.url));
const temporary: string[] = [];
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "readmint-required-"));
  temporary.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const design = (text: string) => [{ file: "t/header.json", text }];
const piped = '{"a": "{{ x | truncateWidth(\\"reg\\", 10) }}"}';

describe("assertActionSupportsDesigns", () => {
  it("throws for a pinned release older than a used filter", () => {
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.2.0", design(piped));
    }).toThrow(
      "owner/action@v0.2.0 predates truncateWidth (Action v0.3.0), which t/header.json uses; pin v0.3.0 or newer",
    );
  });

  it.each(["@v0.3.0", "@v9.9.9", "@v0.10.0", "@main", "@v0", "@6da04fa"])("accepts %s", (ref) => {
    expect(() => {
      assertActionSupportsDesigns(`owner/action${ref}`, design(piped));
    }).not.toThrow();
  });

  it("throws for a pinned release older than a used design property", () => {
    const capped = design('{"layers": [{"type": "text", "maxLines": 2}]}');
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.3.0", capped);
    }).toThrow(
      "owner/action@v0.3.0 predates maxLines (Action v0.4.0), which t/header.json uses; pin v0.4.0 or newer",
    );
    for (const ref of ["@v0.4.0", "@main"]) {
      expect(() => {
        assertActionSupportsDesigns(`owner/action${ref}`, capped);
      }).not.toThrow();
    }
  });

  it("ignores a property name that is not a key", () => {
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.3.0", design('{"content": "maxLines"}'));
    }).not.toThrow();
  });

  it("ignores the word outside a pipe", () => {
    expect(() => {
      assertActionSupportsDesigns(
        "owner/action@v0.1.0",
        design('{"textWidth": 3, "truncateWidth": 4}'),
      );
    }).not.toThrow();
  });
});

describe("list filters", () => {
  const hiding = JSON.stringify({
    layers: [
      {
        type: "group",
        let: { langs: '{{ github.languages | exclude("name", props.languagesHide) }}' },
        children: [{ type: "text", content: '{{ langs | sum("share") }}' }],
      },
    ],
  });

  it.each([
    [JSON.stringify({ a: '{{ list | exclude("name", []) }}' }), "exclude"],
    [JSON.stringify({ a: "{{ list |sum }}" }), "sum"],
    [JSON.stringify({ a: '{{ list | sum("share") }}' }), "sum"],
  ])("throws for a pinned release older than the filter (%#)", (text, filter) => {
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.4.0", design(text));
    }).toThrow(
      `owner/action@v0.4.0 predates ${filter} (Action v0.5.0), which t/header.json uses; pin v0.5.0 or newer`,
    );
  });

  it.each(["@v0.5.0", "@v1.0.0", "@main", "@v0"])("accepts exclude and sum with %s", (ref) => {
    expect(() => {
      assertActionSupportsDesigns(`owner/action${ref}`, design(hiding));
    }).not.toThrow();
  });

  it("ignores a longer filter name and the words outside a pipe", () => {
    const mentions = JSON.stringify({ sum: 1, exclude: [], a: "{{ x | summary }} sum exclude" });
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.4.0", design(mentions));
    }).not.toThrow();
  });
});

describe("layer properties", () => {
  const orbiting = JSON.stringify({
    components: {
      card: {
        layers: [
          {
            type: "group",
            children: [{ type: "rect", orbit: { center: { x: 0, y: 0 }, radius: 1, angle: 0 } }],
          },
        ],
      },
    },
    layers: [{ type: "component", ref: "card" }],
  });
  const letting = JSON.stringify({
    layers: [{ type: "group", let: { n: "{{ 1 }}" }, children: [] }],
  });

  it.each([
    [orbiting, "orbit"],
    [letting, "let"],
  ])("throws for a pinned release older than a property a layer sets (%#)", (text, property) => {
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.3.0", design(text));
    }).toThrow(
      `owner/action@v0.3.0 predates ${property} (Action v0.4.0), which t/header.json uses; pin v0.4.0 or newer`,
    );
  });

  it.each(["@v0.4.0", "@v1.0.0", "@main", "@v0"])("accepts %s", (ref) => {
    expect(() => {
      assertActionSupportsDesigns(`owner/action${ref}`, design(orbiting));
    }).not.toThrow();
  });

  it("ignores the words in texts, values and keys outside layers", () => {
    const mentions = JSON.stringify({
      title: "orbit",
      layers: [
        {
          type: "text",
          content: "let the orbit turn palette",
          props: { orbit: 1, let: 2, palette: 3 },
          palette: "x",
        },
      ],
      tokens: { palette: "#000000" },
    });
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.1.0", design(mentions));
    }).not.toThrow();
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.1.0", design("not json"));
    }).not.toThrow();
  });
});

describe("document keys", () => {
  const palette = JSON.stringify({ palette: { light: { accent: "#0969da" } }, layers: [] });

  it("throws for a pinned release older than a palette on the document", () => {
    expect(() => {
      assertActionSupportsDesigns("owner/action@v0.3.0", design(palette));
    }).toThrow(
      "owner/action@v0.3.0 predates palette (Action v0.4.0), which t/header.json uses; pin v0.4.0 or newer",
    );
  });

  it.each(["@v0.4.0", "@v1.0.0", "@main", "@v0"])("accepts a palette with %s", (ref) => {
    expect(() => {
      assertActionSupportsDesigns(`owner/action${ref}`, design(palette));
    }).not.toThrow();
  });
});

describe("the examples generator", () => {
  it("rejects a release older than the layer properties of the real templates", () => {
    expect(() =>
      buildExamples(templatesDir, {
        login: "octo",
        actionRef: "owner/action@v0.3.0",
        props: profileExampleProps,
      }),
    ).toThrow(/predates (let|orbit) \(Action v0\.4\.0\)/);
  });

  it("rejects an older Action over the real templates", () => {
    expect(() =>
      buildExamples(templatesDir, {
        login: "octo",
        actionRef: "owner/action@v0.2.0",
        props: profileExampleProps,
      }),
    ).toThrow(/textWidth|truncateWidth/);
  });

  it("detects a filter in a synthetic template", () => {
    const dir = temp();
    const template = join(dir, "profiles", "demo");
    mkdirSync(template, { recursive: true });
    writeFileSync(join(template, "README.md"), "# Demo\n\n## The README\n\n```html\n<img>\n```\n");
    const body =
      '{"layers":[{"type":"component","props":{"t":"{{ a | truncateWidth(\\"reg\\", 1) }}"}}]}\n';
    writeFileSync(join(template, "a.json"), body);
    writeFileSync(
      join(template, "renders.json"),
      '{"renders":[{"name":"a","design":"a.json","variants":["dark"]}]}\n',
    );
    const options = { login: "octo", actionRef: "owner/action@v0.2.0", props: {} };
    expect(() => buildExamples(dir, options)).toThrow(/truncateWidth.*demo\/a\.json/);
    expect(() =>
      buildExamples(dir, { ...options, actionRef: "owner/action@v0.4.0" }),
    ).not.toThrow();
  });

  it("fails runExamples --check with exit 1 and the message", () => {
    let err = "";
    const code = runExamples([templatesDir, temp(), "--check", "--action", "owner/action@v0.2.0"], {
      stdout: () => undefined,
      stderr: (text) => (err += text),
    });
    expect(code).toBe(1);
    expect(err).toContain("pin v0.3.0 or newer");
  });
});
