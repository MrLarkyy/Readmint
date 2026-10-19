import {
  animatedProperties,
  DesignLimits,
  type AnimatedProperty,
  type Easing,
  type Layer,
} from "@readmint/format";
import { keyAttributes } from "./ControlKey.js";
import { childPointer } from "./designPointer.js";
import { element } from "./dom.js";
import { easingField } from "./easingField.js";
import { findLayer } from "./layerAccess.js";
import { fieldText, parseField } from "./LayerField.js";
import { newTrack } from "./newTrack.js";
import type { PanelContext } from "./PanelContext.js";

type Frame = Record<string, unknown>;
type Draft = Record<string, unknown> & { keyframes: Frame[] };

const binding = /^\{\{[\s\S]+\}\}$/u;
const home = ["track-add", "add-track"];
const trackNumbers = ["duration", "delay", "stagger", "cycles"] as const;

/** The tracks of `layer` that exist, in the format's table order. */
export function presentTracks(layer: Layer): readonly AnimatedProperty[] {
  const animate = layer.animate as Record<string, unknown> | undefined;
  return animatedProperties(layer.type).filter(
    (entry) => animate !== undefined && Object.hasOwn(animate, entry.property),
  );
}

/**
 * The animation tracks of a layer: per track its duration, delay, stagger, cycles (a number, the keyframes listed once)
 * and easing, and a table of keyframes (offset, value, easing); "Add track" for a property that has none. Each change
 * stores one whole new track through `actions.setTrack`.
 */
export function animateFieldset(form: HTMLElement, context: PanelContext, pointer: string): void {
  const { actions } = context;
  const layerNow = () => findLayer(context.latest().design, pointer);
  const layer = layerNow();
  if (layer === undefined) return;
  const box = element(form, "fieldset", { className: "rm-fieldset rm-animate" });
  element(box, "legend", { text: "Animation" });
  const trackNow = (property: string): Draft | undefined => {
    const animate = layerNow()?.animate as Record<string, unknown> | undefined;
    return animate !== undefined && Object.hasOwn(animate, property)
      ? (animate[property] as Draft)
      : undefined;
  };
  const modify = (property: string, change: (draft: Draft) => void) => {
    const current = trackNow(property);
    if (current === undefined) return;
    const draft = structuredClone(current);
    change(draft);
    actions.setTrack(pointer, property, draft);
  };
  const modifyFrames = (property: string, change: (frames: Frame[]) => void) => {
    modify(property, (draft) => {
      change(draft.keyframes);
    });
  };

  const keyframeRow = (
    parent: HTMLElement,
    entry: AnimatedProperty,
    t: number,
    r: number,
    count: number,
    trackPath: string,
  ) => {
    const { property } = entry;
    const base = childPointer(childPointer(trackPath, "keyframes"), r);
    const item = element(parent, "div", { className: "rm-keyframe" });
    const row = element(item, "div", { className: "rm-keyframe-row" });
    const key = (kind: string) => keyAttributes(kind, [t, r], home);
    const frame = () => trackNow(property)?.keyframes[r];
    const modifyFrame = (change: (target: Frame) => void) => {
      modifyFrames(property, (frames) => {
        const target = frames[r];
        if (target !== undefined) change(target);
      });
    };
    const label = `${property} keyframe ${String(r + 1)}`;
    const offset = element(row, "input", {
      attributes: {
        name: `animate.${property}.keyframes.${String(r)}.offset`,
        "aria-label": `${label} offset`,
        ...key("kf-offset"),
      },
    });
    context.bind(offset, () => fieldText(frame()?.["offset"]));
    offset.addEventListener("change", () => {
      const parsed = parseField({ key: "offset", kind: "number", required: true }, offset.value);
      if (!parsed.ok) {
        actions.invalid(`keyframe ${parsed.message}`, childPointer(base, "offset"));
        return;
      }
      modifyFrame((target) => {
        target["offset"] = parsed.value;
      });
    });
    const value = element(row, "input", {
      attributes: {
        name: `animate.${property}.keyframes.${String(r)}.value`,
        "aria-label": `${label} value`,
        ...key("kf-value"),
      },
    });
    context.bind(value, () => {
      const now = frame()?.["value"];
      value.classList.toggle("rm-bound", typeof now === "string" && binding.test(now));
      return fieldText(now);
    });
    value.addEventListener("change", () => {
      const parsed = parseField(
        { key: "value", kind: entry.value === "colour" ? "paint" : "number", required: true },
        value.value,
      );
      if (!parsed.ok) {
        actions.invalid(`keyframe ${parsed.message}`, childPointer(base, "value"));
        return;
      }
      modifyFrame((target) => {
        target["value"] = parsed.value;
      });
    });
    const insert = element(row, "button", {
      text: "Add after",
      attributes: { type: "button", "aria-label": `Add keyframe after ${label}`, ...key("kf-add") },
    });
    insert.disabled = count >= DesignLimits.maxTrackKeyframes;
    insert.addEventListener("click", () => {
      context.focusAfter("kf-offset", [t, r + 1]);
      modifyFrames(property, (frames) => {
        const from = frames[r];
        const to = frames[r + 1];
        const start = Number(from?.["offset"]);
        const end = to === undefined ? start : Number(to["offset"]);
        frames.splice(r + 1, 0, {
          offset: Number(((start + end) / 2).toFixed(6)),
          value: from?.["value"],
        });
      });
    });
    const remove = element(row, "button", {
      text: "Remove",
      attributes: { type: "button", "aria-label": `Remove ${label}`, ...key("kf-remove") },
    });
    remove.disabled = count <= DesignLimits.minTrackKeyframes;
    remove.addEventListener("click", () => {
      modifyFrames(property, (frames) => {
        frames.splice(r, 1);
      });
    });
    easingField(item, context, {
      name: `animate.${property}.keyframes.${String(r)}.easing`,
      kind: "kf-easing",
      at: [t, r],
      home,
      path: childPointer(base, "easing"),
      read: () => frame()?.["easing"],
      commit: (easing: Easing | undefined) => {
        modifyFrame((target) => {
          if (easing === undefined) delete target["easing"];
          else target["easing"] = easing;
        });
      },
    });
  };

  const trackBox = (entry: AnimatedProperty, t: number) => {
    const { property } = entry;
    const trackPath = childPointer(childPointer(pointer, "animate"), property);
    const track = element(box, "fieldset", { className: "rm-fieldset rm-track" });
    element(track, "legend", { text: property });
    const key = (kind: string) => keyAttributes(kind, [t], home);
    for (const field of trackNumbers) {
      const label = element(track, "label", { className: "rm-field" });
      element(label, "span", { text: field });
      const input = element(label, "input", {
        attributes: { name: `animate.${property}.${field}`, ...key(`track-${field}`) },
      });
      context.bind(input, () => {
        const value = trackNow(property)?.[field];
        input.classList.toggle("rm-bound", typeof value === "string" && binding.test(value));
        return fieldText(value);
      });
      input.addEventListener("change", () => {
        const parsed = parseField({ key: field, kind: "number" }, input.value);
        if (!parsed.ok) {
          actions.invalid(parsed.message, childPointer(trackPath, field));
          return;
        }
        modify(property, (draft) => {
          if (parsed.value === undefined) Reflect.deleteProperty(draft, field);
          else draft[field] = parsed.value;
        });
      });
    }
    easingField(track, context, {
      name: `animate.${property}.easing`,
      kind: "track-easing",
      at: [t],
      home,
      path: childPointer(trackPath, "easing"),
      read: () => trackNow(property)?.["easing"],
      commit: (easing: Easing | undefined) => {
        modify(property, (draft) => {
          if (easing === undefined) delete draft["easing"];
          else draft["easing"] = easing;
        });
      },
    });
    const count = trackNow(property)?.keyframes.length ?? 0;
    for (let r = 0; r < count; r++) keyframeRow(track, entry, t, r, count, trackPath);
    const add = element(track, "button", {
      text: "Add keyframe",
      attributes: {
        type: "button",
        "aria-label": `Add keyframe to ${property}`,
        ...key("track-add"),
      },
    });
    add.disabled = count >= DesignLimits.maxTrackKeyframes;
    add.addEventListener("click", () => {
      context.focusAfter("kf-offset", [t, count]);
      modifyFrames(property, (frames) => {
        const last = frames[frames.length - 1];
        frames.push({ offset: last?.["offset"] ?? 1, value: last?.["value"] });
      });
    });
    const remove = element(track, "button", {
      text: "Remove track",
      attributes: {
        type: "button",
        "aria-label": `Remove ${property} track`,
        ...key("track-remove"),
      },
    });
    remove.addEventListener("click", () => {
      actions.setTrack(pointer, property, undefined);
    });
  };

  const present = presentTracks(layer);
  present.forEach((entry, index) => {
    trackBox(entry, index);
  });
  const absent = animatedProperties(layer.type).filter((entry) => !present.includes(entry));
  if (absent.length === 0) return;
  const hasTimeline = context.latest().design.animation !== undefined;
  const label = element(box, "label", { className: "rm-field" });
  element(label, "span", { text: "Add track" });
  const select = element(label, "select", {
    attributes: { name: "add-track", ...keyAttributes("add-track", [], []) },
  });
  const none = element(select, "option", { text: "(property)" });
  none.value = "";
  for (const entry of absent) {
    const option = element(select, "option", { text: entry.property });
    option.value = entry.property;
  }
  select.disabled = !hasTimeline;
  if (!hasTimeline) {
    element(box, "p", { className: "rm-note", text: "Add a timeline on the canvas first." });
  }
  select.addEventListener("change", () => {
    const now = layerNow();
    const chosen = animatedProperties(layer.type).find((entry) => entry.property === select.value);
    select.value = "";
    if (chosen === undefined || now === undefined) return;
    const index = animatedProperties(now.type)
      .filter((entry) => entry === chosen || presentTracks(now).includes(entry))
      .indexOf(chosen);
    context.focusAfter("kf-offset", [index, 0]);
    actions.setTrack(pointer, chosen.property, newTrack(now, chosen));
  });
}
