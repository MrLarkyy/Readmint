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
}

export interface EllipseLayer extends LayerBase, ShapeProps {
  readonly type: "ellipse";
  readonly width: Bindable<number>;
  readonly height: Bindable<number>;
}

export interface PathLayer extends LayerBase, ShapeProps {
  readonly type: "path";
  /** SVG path data; only commands, numbers, separators and whitespace. */
  readonly d: string;
}

export interface TextLayer extends LayerBase {
  readonly type: "text";
  /** May hold `{{...}}` placeholders anywhere. */
  readonly content: string;
  readonly width?: Bindable<number>;
  readonly fill?: Paint;
  readonly font?: string;
  readonly fontSize?: Bindable<number>;
  readonly fontWeight?: Bindable<number>;
  readonly lineHeight?: Bindable<number>;
  readonly letterSpacing?: Bindable<number>;
  readonly align?: TextAlign;
}

export interface ImageLayer extends LayerBase {
  readonly type: "image";
  readonly asset: string;
  readonly width: Bindable<number>;
  readonly height: Bindable<number>;
  readonly fit?: "contain" | "cover" | "fill";
  readonly alt?: string;
}

export type ComponentPropValue = string | number | boolean;

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
  /** SPDX identifier, e.g. `OFL-1.1`. */
  readonly name?: string;
}

export interface FontAsset {
  readonly family: string;
  readonly src: AssetSource;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly licence: FontLicence;
}

export interface ImageAsset {
  readonly src: AssetSource;
  readonly width?: number;
  readonly height?: number;
}

export interface ComponentPropDefinition {
  readonly type: "string" | "number" | "boolean" | "color";
  readonly required?: boolean;
  readonly default?: ComponentPropValue;
}

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

export interface Design {
  /** Editor hint (the published JSON Schema); ignored by Readmint. */
  readonly $schema?: string;
  readonly version: 0;
  readonly title?: string;
  readonly description?: string;
  readonly canvas: Canvas;
  readonly layers: readonly Layer[];
  readonly styles?: Readonly<Record<string, Style>>;
  readonly assets?: {
    readonly fonts?: Readonly<Record<string, FontAsset>>;
    readonly images?: Readonly<Record<string, ImageAsset>>;
  };
  readonly components?: Readonly<Record<string, ComponentDefinition>>;
}
