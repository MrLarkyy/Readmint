import type { Binding } from "@readmint/format";

/**
 * What a binding sees: a null-prototype object holding the own keys of the render data plus the locals of the
 * place it is evaluated in (the `repeat` item and index, `props` inside a component); locals win.
 */
export type RenderScope = Readonly<Record<string, unknown>>;

/**
 * Evaluates bindings. The renderer stays independent of the expression language: the CLI, the Action and the
 * editor pass the same implementation, so the preview equals the output. A thrown error becomes a `binding`
 * issue whose message carries at most 200 characters of the error message; keeping secrets out of it is the
 * evaluator's job.
 */
export interface ExpressionEvaluator {
  /** The value of a `{{...}}` property. */
  evaluate(binding: Binding, scope: RenderScope): unknown;
  /** A text content with its `{{...}}` placeholders filled in. */
  interpolate(template: string, scope: RenderScope): string;
}
