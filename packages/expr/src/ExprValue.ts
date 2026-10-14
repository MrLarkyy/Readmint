/** A JSON value: the only kind of value data, locals and evaluation results may hold. */
export type ExprValue = null | boolean | number | string | ExprArray | ExprObject;

export type ExprArray = readonly ExprValue[];

export interface ExprObject {
  readonly [key: string]: ExprValue;
}
