import type { LoadedFont } from "./loadFont.js";
import type { LoadedImage } from "./loadImage.js";
import type { NodeAnimation } from "./NodeAnimation.js";
import type { Paint } from "./paint.js";
import type { TextLine } from "./TextLine.js";

/**
 * A layer with every binding evaluated and its box measured. `x`/`y` start as the layer's own values and are set
 * to the final position in the parent's coordinates by the parent's layout.
 */
export interface NodeBase {
  readonly path: string;
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
  readonly opacity: number | undefined;
  readonly rotation: number | undefined;
  /** Tracks on the design's timeline; never changes the layout. */
  readonly animation?: NodeAnimation;
}

export interface ShapeStyle {
  readonly fill: Paint | undefined;
  readonly stroke: Paint | undefined;
  readonly strokeWidth: number | undefined;
}

export interface GroupNode extends NodeBase {
  readonly kind: "group";
  readonly children: readonly RenderNode[];
  readonly clip: boolean;
}

export interface RectNode extends NodeBase, ShapeStyle {
  readonly kind: "rect";
  readonly radius: number | undefined;
}

export interface EllipseNode extends NodeBase, ShapeStyle {
  readonly kind: "ellipse";
}

export interface PathNode extends NodeBase, ShapeStyle {
  readonly kind: "path";
  readonly d: string;
}

export interface TextNode extends NodeBase {
  readonly kind: "text";
  /** The text after filling placeholders: the accessible name of text drawn as paths. */
  readonly text: string;
  readonly lines: readonly TextLine[];
  /** The font the text names (after weight matching); fallback runs carry their own. */
  readonly font: LoadedFont;
  readonly fontSize: number;
  /** `paths` when any font the text draws with is drawn as paths: the whole text then is. */
  readonly drawnAs: "font" | "paths";
  /** Font mode writes some glyph as a private-use character (see TextLayout). */
  readonly privateUse: boolean;
  /** Some glyph is right-to-left (see TextLayout). */
  readonly rtl: boolean;
  readonly fill: Paint | undefined;
  /** Offset of the first baseline from the top of the box. */
  readonly baseline: number;
  /** Distance between baselines. */
  readonly lineAdvance: number;
}

export interface ImageNode extends NodeBase {
  readonly kind: "image";
  readonly image: LoadedImage;
  readonly fit: "contain" | "cover" | "fill";
  readonly alt: string | undefined;
}

export type RenderNode = GroupNode | RectNode | EllipseNode | PathNode | TextNode | ImageNode;
