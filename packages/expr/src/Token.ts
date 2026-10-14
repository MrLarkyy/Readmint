import type { Span } from "./Span.js";

export type Operator =
  | "("
  | ")"
  | "["
  | "]"
  | ","
  | "."
  | "|"
  | "?"
  | ":"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "!"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||";

export type Token = Span &
  (
    | { readonly kind: "number"; readonly value: number }
    | { readonly kind: "string"; readonly value: string }
    | { readonly kind: "name"; readonly value: string }
    | { readonly kind: "operator"; readonly value: Operator }
    | { readonly kind: "close"; readonly value: "}}" }
  );
