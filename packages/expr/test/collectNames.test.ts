import { describe, expect, test } from "vitest";
import { compileTemplate } from "../src/index.js";

function namesOf(text: string): string[] {
  const template = compileTemplate(text);
  if (!template.ok) expect.fail(template.error.message);
  return [...template.value.names];
}

describe("Template.names", () => {
  test.each([
    ["{{ a + b.c | default(d) }}", ["a", "b", "d"]],
    ["{{ x.props }}", ["x"]],
    ["{{ 'a + b' }}", []],
    ["{{ c ? a : [e] }}", ["c", "a", "e"]],
    ["{{ m[k] && !n || -o }}", ["m", "k", "n", "o"]],
    ["{{ my-label }}", ["my-label"]],
    ["{{ x-1 }}", ["x"]],
    ["{{ true }}{{ null }}", []],
    ["plain text", []],
  ])("%s reads %j", (text, names) => {
    expect(namesOf(text)).toEqual(names);
  });

  test("a text template unions the names of every placeholder, each once", () => {
    expect(namesOf("{{ a }} and {{ b }} and {{ a }}")).toEqual(["a", "b"]);
  });
});
