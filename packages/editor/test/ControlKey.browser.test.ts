import { afterEach, expect, test } from "vitest";
import { controlKey, focusControl, keyAttributes } from "../src/ControlKey.js";

const form = document.createElement("form");

afterEach(() => {
  form.replaceChildren();
  form.remove();
});

function control(kind: string, at: readonly number[], home: readonly string[] = []): HTMLElement {
  const input = document.createElement("input");
  for (const [name, value] of Object.entries(keyAttributes(kind, at, home)))
    input.setAttribute(name, value);
  form.append(input);
  return input;
}

function button(action: string): HTMLButtonElement {
  const made = document.createElement("button");
  made.setAttribute("data-action", action);
  form.append(made);
  return made;
}

test("a key is read from data-key, else the name, else the action; positions and homes are parsed", () => {
  document.body.append(form);
  expect(controlKey(control("colour", [2, 1], ["add-token"]))).toEqual({
    kind: "colour",
    at: [2, 1],
    home: ["add-token"],
  });
  const named = document.createElement("input");
  named.name = "x";
  expect(controlKey(named)).toEqual({ kind: "x", at: [], home: [] });
  expect(controlKey(button("add-token"))).toEqual({ kind: "add-token", at: [], home: [] });
  expect(controlKey(document.createElement("div"))).toBeUndefined();
});

test("the focus goes to the same place, the next one, the home, then the previous one", () => {
  document.body.append(form);
  const cell = control("colour", [0, 1]);
  const next = control("colour", [1, 0]);
  focusControl(form, { kind: "colour", at: [0, 1], home: [] });
  expect(document.activeElement).toBe(cell);
  focusControl(form, { kind: "colour", at: [0, 2], home: [] });
  expect(document.activeElement).toBe(next);
  const add = button("add-token");
  focusControl(form, { kind: "colour", at: [3, 0], home: ["missing", "add-token"] });
  expect(document.activeElement).toBe(add);
  add.disabled = true;
  focusControl(form, { kind: "colour", at: [3, 0], home: ["add-token"] });
  expect(document.activeElement).toBe(next);
});

test("a disabled control is skipped and nothing is focused when no candidate is left", () => {
  document.body.append(form);
  const up = button("let-up");
  up.disabled = true;
  const outside = document.createElement("input");
  document.body.append(outside);
  outside.focus();
  focusControl(form, { kind: "let-up", at: [], home: [] });
  expect(document.activeElement).toBe(outside);
  outside.remove();
});
