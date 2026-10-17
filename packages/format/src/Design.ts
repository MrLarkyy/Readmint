import type { DesignLocale } from "./designLocales.js";

/** A value written as `{{...}}` (starts with `{{`, ends with `}}`); opaque here, evaluated by `@readmint/expr`. */
export type Binding = `{{${string}}}`;

export type Bindable<T> = T | Binding;

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
export type Colour = `#${string}`;

export interface GradientStop {
  readonly offset: Bindable<number>;
  readonly color: Bindable<Colour>;
}

export interface LinearGradient {
  readonly type: "linear";
  readonly x1?: Bindable<number>;
  readonly y1?: Bindable<number>;
  readonly x2?: Bindable<number>;
  readonly y2?: Bindable<number>;
  readonly stops: readonly GradientStop[];
}

export interface RadialGradient {
  readonly type: "radial";
  readonly cx?: Bindable<number>;
  readonly cy?: Bindable<number>;
  readonly r?: Bindable<number>;
  readonly stops: readonly GradientStop[];
}

export type Paint = Colour | "none" | Binding | LinearGradient | RadialGradient;

export type TextAlign = "start" | "middle" | "end";

export interface Style {
  readonly fill?: Paint;
  readonly stroke?: Paint;
  readonly strokeWidth?: Bindable<number>;
  readonly opacity?: Bindable<number>;
  readonly font?: string;
  readonly fontSize?: Bindable<number>;
  readonly fontWeight?: Bindable<number>;
  readonly lineHeight?: Bindable<number>;
  readonly letterSpacing?: Bindable<number>;
  readonly align?: TextAlign;
}

export interface Repeat {
  readonly each: Binding;
  readonly as?: string;
  readonly index?: string;
}

/** Named CSS easings; `linear` is the default. */
export type EasingKeyword = "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";

/** A CSS `cubic-bezier(x1, y1, x2, y2)`: x in [0, 1], y in [-10, 10] (outside [0, 1] overshoots). */
export interface CubicBezier {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type Easing = EasingKeyword | CubicBezier;

export interface Keyframe<T> {
  /** Fraction of the track's duration, in [0, 1]; offsets of a track never decrease. */
  readonly offset: number;
  readonly value: Bindable<T>;
  /** Easing from this keyframe to the next; the track's easing when absent. */
  readonly easing?: Easing;
}

/** Keyframes of one property; times in milliseconds on the design's timeline. */
export interface AnimationTrack<T> {
  /** 2 to 32 keyframes. */
  readonly keyframes: readonly Keyframe<T>[];
  /** Default: the timeline's duration. */
  readonly duration?: Bindable<number>;
  readonly delay?: Bindable<number>;
  /** Added to `delay` once per index of the layer's own `repeat`. */
  readonly stagger?: Bindable<number>;
  readonly easing?: Easing;
}

/** Tracks every layer kind takes; `x`, `y`, `scale` and `rotation` add to the layout around the box centre. */
export interface LayerAnimation {
  readonly opacity?: AnimationTrack<number>;
  readonly x?: AnimationTrack<number>;
  readonly y?: AnimationTrack<number>;
  readonly scale?: AnimationTrack<number>;
  readonly rotation?: AnimationTrack<number>;
}

export interface ShapeAnimation extends LayerAnimation {
  readonly fill?: AnimationTrack<Colour>;
  readonly stroke?: AnimationTrack<Colour>;
}

export interface PathAnimation extends ShapeAnimation {
  /**
   * The drawn fraction of the stroke, in [0, 1]: every subpath draws from its own start at the pace of the longest
   * one, so shorter subpaths finish earlier. The path data must hold no arc.
   */
  readonly draw?: AnimationTrack<number>;
}

export interface TextAnimation extends LayerAnimation {
  readonly fill?: AnimationTrack<Colour>;
}

/** The one timeline of a design. */
export interface Animation {
  /** Milliseconds, an integer in 1..60000. */
  readonly duration: number;
  /** Default true. */
  readonly loop?: boolean;
}

export interface OrbitCentre {
  readonly x: Bindable<number>;
  readonly y: Bindable<number>;
}

/**
 * Opacity by depth on the orbit: depth is the sine of the angle, -1 at the back (top) to 1 at the front (bottom). The
 * layer is invisible at depth `from` and below, fully drawn at `to` and above (the other way round when `to` is the
 * smaller), linear in between; `from` and `to` differ.
 */
export interface OrbitFade {
  readonly from: number;
  readonly to: number;
}

/**
 * Places the layer on an ellipse around `center`: its origin sits at (cx + radius cos t, cy + radiusY sin t), t in
 * degrees clockwise from +x. The layer's own `x`, `y`, `rotation` and `animate` apply in a frame at that point, which
 * stays upright unless `upright` is false (then it turns by t). Only in an absolute group.
 */
export interface Orbit {
  readonly center: OrbitCentre;
  readonly radius: Bindable<number>;
  /** Default: `radius` (a circle). */
  readonly radiusY?: Bindable<number>;
  /** t at the start of the timeline, in degrees in [-360, 360]. */
  readonly angle: Bindable<number>;
  /** Degrees per second along the orbit on the design's timeline (needs `animation`); default 0. */
  readonly speed?: Bindable<number>;
  /** Default true. */
  readonly upright?: Bindable<boolean>;
  readonly fade?: OrbitFade;
}

export interface LayerBase {
  readonly id?: string;
  readonly name?: string;
  readonly x?: Bindable<number>;
  readonly y?: Bindable<number>;
  readonly opacity?: Bindable<number>;
  readonly rotation?: Bindable<number>;
  readonly visible?: Bindable<boolean>;
  readonly style?: string;
  readonly if?: Binding;
  readonly repeat?: Repeat;
  /**
   * Local names, each bound to a binding evaluated per copy after `repeat` and before `visible`, `if` and the rest of
   * the layer; key order is evaluation order, an entry reads the entries before it. Visible to the layer and its
   * subtree, including the layers of a component it instantiates.
   */
  readonly let?: Readonly<Record<string, Binding>>;
  /** Needs the design's `animation`. */
  readonly animate?: LayerAnimation;
  readonly orbit?: Orbit;
}

export type Layout =
  | { readonly type: "absolute" }
  | {
      readonly type: "stack";
      readonly direction: "row" | "column";
      readonly gap?: Bindable<number>;
      readonly align?: "start" | "center" | "end";
    }
  | { readonly type: "grid"; readonly columns: Bindable<number>; readonly gap?: Bindable<number> };

export interface GroupLayer extends LayerBase {
  readonly type: "group";
  readonly children: readonly Layer[];
  readonly width?: Bindable<number>;
  readonly height?: Bindable<number>;
  readonly clip?: Bindable<boolean>;
  readonly layout?: Layout;
}

export interface ShapeProps {
  readonly fill?: Paint;
  readonly stroke?: Paint;
  readonly strokeWidth?: Bindable<number>;
}

export interface RectLayer extends LayerBase, ShapeProps {
  readonly type: "rect";
  readonly width: Bindable<number>;
  readonly height: Bindable<number>;
  readonly radius?: Bindable<number>;
  readonly animate?: ShapeAnimation;
}

export interface EllipseLayer extends LayerBase, ShapeProps {
  readonly type: "ellipse";
  readonly width: Bindable<number>;
  readonly height: Bindable<number>;
  readonly animate?: ShapeAnimation;
}

export interface PathLayer extends LayerBase, ShapeProps {
  readonly type: "path";
  /**
   * SVG path data (only commands, numbers, separators and whitespace), or a template with `{{ }}` placeholders that
   * the renderer evaluates as text and holds to the same rules.
   */
  readonly d: string;
  readonly animate?: PathAnimation;
}

export interface TextLayer extends LayerBase {
  readonly type: "text";
  /** May hold `{{...}}` placeholders anywhere. */
  readonly content: string;
  readonly width?: Bindable<number>;
  /** At most this many lines are drawn; the last drawn line of a longer text ends with an ellipsis. */
  readonly maxLines?: Bindable<number>;
  readonly fill?: Paint;
  readonly font?: string;
  readonly fontSize?: Bindable<number>;
  readonly fontWeight?: Bindable<number>;
  readonly lineHeight?: Bindable<number>;
  readonly letterSpacing?: Bindable<number>;
  readonly align?: TextAlign;
  readonly animate?: TextAnimation;
}

export interface ImageLayer extends LayerBase {
  readonly type: "image";
  readonly asset: string;
  readonly width: Bindable<number>;
  readonly height: Bindable<number>;
  readonly fit?: "contain" | "cover" | "fill";
  readonly alt?: string;
}

export type ComponentPropScalar = string | number | boolean;

/** A scalar, or a literal list of scalars for an `array` prop (at most 1000 items). */
export type ComponentPropValue = ComponentPropScalar | readonly ComponentPropScalar[];

export interface ComponentLayer extends LayerBase {
  readonly type: "component";
  readonly ref: string;
  readonly width?: Bindable<number>;
  readonly height?: Bindable<number>;
  readonly props?: Readonly<Record<string, ComponentPropValue>>;
}

export type Layer =
  GroupLayer | RectLayer | EllipseLayer | PathLayer | TextLayer | ImageLayer | ComponentLayer;

export type LayerType = Layer["type"];

/** A relative path without `..` segments or a base64 `data:` URI. */
export type AssetSource = string;

export interface FontLicence {
  /** Declared by the author; the renderer also honours the font's OS/2 fsType (stricter wins). */
  readonly embedding: "allowed" | "restricted";
  /**
   * SPDX identifier, e.g. `OFL-1.1`; `OFL-1.1-RFN` and `OFL-1.1-no-RFN` (also 1.0) say whether a Reserved Font Name
   * applies.
   */
  readonly name?: string;
  /**
   * Whether the font has a Reserved Font Name (SIL Open Font License). Such a font is never embedded as a subset (a
   * Modified Version, which may not use the name): its text is drawn as paths. Set, it wins over `name` and over what
   * the font's own name table states; `false` covers written permission from the holder of the name.
   */
  readonly reservedFontName?: boolean;
}

export interface FontAsset {
  readonly family: string;
  readonly src: AssetSource;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly licence: FontLicence;
  /**
   * `font` (default) embeds a subset of the used glyphs; `paths` draws every text that uses this font as path data
   * and embeds nothing. A restricted font is always drawn as paths.
   */
  readonly drawAs?: "font" | "paths";
  /**
   * Font asset ids (1 to 8, each once) tried in order for a character this font does not have; not transitive, the
   * same weight and style are matched within each fallback's family.
   */
  readonly fallback?: readonly string[];
  /** Pair kerning from the font (GPOS `kern` or the `kern` table); default true. */
  readonly kerning?: boolean;
}

export interface ImageAsset {
  /**
   * An asset source, or a `{{binding}}` evaluated against the root of the render data (never a repeat item) that
   * yields an https URL; the CLI (`--fetch-images`) and the Action fetch, check and supply its bytes.
   */
  readonly src: Bindable<AssetSource>;
  readonly width?: number;
  readonly height?: number;
}

export interface ScalarPropDefinition {
  readonly type: "string" | "number" | "boolean" | "color";
  readonly required?: boolean;
  readonly default?: ComponentPropScalar;
}

/** A string that must be one of `values` (1 to 64 strings); a bound value is checked when rendering. */
export interface EnumPropDefinition {
  readonly type: "enum";
  readonly values: readonly string[];
  readonly required?: boolean;
  readonly default?: string;
}

/** A list, literal or bound to data; a `repeat` in the component can iterate it as `{{ props.<name> }}`. */
export interface ArrayPropDefinition {
  readonly type: "array";
  readonly required?: boolean;
  readonly default?: readonly ComponentPropScalar[];
}

export type ComponentPropDefinition =
  ScalarPropDefinition | EnumPropDefinition | ArrayPropDefinition;

export interface ComponentDefinition {
  readonly description?: string;
  readonly width?: number;
  readonly height?: number;
  readonly props?: Readonly<Record<string, ComponentPropDefinition>>;
  readonly layers: readonly Layer[];
}

export interface Canvas {
  readonly width: Bindable<number>;
  readonly height: Bindable<number>;
  readonly background?: Paint;
}

/**
 * Colours by mode, then by token: `palette.<mode>.<token>`. Every mode holds the same tokens. Expressions read the
 * active mode's tokens as `{{ palette.<token> }}`; the active mode is the `theme` prop of the root instance when its
 * component declares one, else the first mode in document order.
 */
export type Palette = Readonly<Record<string, Readonly<Record<string, Colour>>>>;

export interface Design {
  /** Editor hint (the published JSON Schema); ignored by Readmint. */
  readonly $schema?: string;
  readonly version: 0;
  readonly title?: string;
  readonly description?: string;
  /**
   * Locale of the `number`, `compact`, `percent` and `date` filters in every expression of the design. A filter's
   * `locale` argument or the render option `locale` overrides it; default `en`.
   */
  readonly locale?: DesignLocale;
  readonly canvas: Canvas;
  readonly layers: readonly Layer[];
  readonly styles?: Readonly<Record<string, Style>>;
  readonly assets?: {
    readonly fonts?: Readonly<Record<string, FontAsset>>;
    readonly images?: Readonly<Record<string, ImageAsset>>;
  };
  readonly components?: Readonly<Record<string, ComponentDefinition>>;
  /** Named colours per mode; when set, `palette` is an expression name and no data key, `let` or repeat may take it. */
  readonly palette?: Palette;
  /** The timeline every layer's `animate` runs on. */
  readonly animation?: Animation;
}
