const controls = "input, select, textarea, button";

/**
 * Where a control of the property panel sits, built from positions and never from names, so the focus finds its
 * place again after a rebuild that renamed or removed something.
 */
export interface ControlKey {
  /** What the control is, the same in every row: `data-key`, else its `name`, else its `data-action`. */
  readonly kind: string;
  /** Its row (and column) among the controls of its kind (`data-at`, e.g. `2.1`); empty for a single control. */
  readonly at: readonly number[];
  /** The kinds to focus when none of `kind` is left at or after `at` (`data-home`, e.g. the group's Add button). */
  readonly home: readonly string[];
}

/** The attributes that give a control in a row its key. */
export function keyAttributes(
  kind: string,
  at: readonly number[],
  home: readonly string[],
): Record<string, string> {
  return { "data-key": kind, "data-at": at.join("."), "data-home": home.join(" ") };
}

/** The key of a control, or undefined for an element that is none. */
export function controlKey(control: Element): ControlKey | undefined {
  const kind =
    control.getAttribute("data-key") ??
    control.getAttribute("name") ??
    control.getAttribute("data-action");
  if (kind === null || !control.matches(controls)) return undefined;
  const at = control.getAttribute("data-at") ?? "";
  const home = control.getAttribute("data-home") ?? "";
  return {
    kind,
    at: at === "" ? [] : at.split(".").map(Number),
    home: home === "" ? [] : home.split(" "),
  };
}

/**
 * Focuses the control of `form` that takes the place of `key`: the first enabled one of its kind at or after its
 * position (the same control after a rename, the next row after a removal), else the first of its home kinds, else
 * the last of its kind before it; nothing when none is left.
 */
export function focusControl(form: Element, key: ControlKey): void {
  const keyed = [...form.querySelectorAll<HTMLElement>(controls)].flatMap((control) => {
    const found = controlKey(control);
    return found === undefined || isDisabled(control) ? [] : [{ control, key: found }];
  });
  const same = keyed.filter((item) => item.key.kind === key.kind);
  const target =
    same.find((item) => compare(item.key.at, key.at) >= 0) ??
    key.home
      .map((kind) => keyed.find((item) => item.key.kind === kind))
      .find((item) => item !== undefined) ??
    same.findLast((item) => compare(item.key.at, key.at) < 0);
  target?.control.focus();
}

function isDisabled(control: HTMLElement): boolean {
  return "disabled" in control && control.disabled === true;
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? -1) - (b[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}
