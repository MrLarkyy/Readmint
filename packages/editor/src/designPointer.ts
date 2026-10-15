/**
 * The one key the format never allows (ids start with a letter) and a plain object would treat as its prototype; any
 * other name, `constructor` and `prototype` included, is an ordinary key: reads go through own properties only and
 * writes define own properties, so no name reaches a prototype.
 */
const prototypeKey = "__proto__";

/** RFC 6901 tokens of a pointer, or undefined when it is malformed or names `__proto__`. */
export function parsePointer(pointer: string): string[] | undefined {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) return undefined;
  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
  return tokens.includes(prototypeKey) ? undefined : tokens;
}

/** `key` appended to `parent`, escaped. */
export function childPointer(parent: string, key: string | number): string {
  const token =
    typeof key === "number" ? String(key) : key.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${parent}/${token}`;
}

/** The pointer of the object or array holding `pointer`'s target, and the target's key. */
export function splitPointer(pointer: string): { parent: string; key: string } | undefined {
  const tokens = parsePointer(pointer);
  const key = tokens?.at(-1);
  if (tokens === undefined || key === undefined) return undefined;
  return { parent: pointer.slice(0, pointer.lastIndexOf("/")), key };
}

/** The value at `pointer`, reading own properties only; undefined when there is none. */
export function getAt(root: unknown, pointer: string): unknown {
  const tokens = parsePointer(pointer);
  if (tokens === undefined) return undefined;
  let value = root;
  for (const token of tokens) {
    value = child(value, token);
    if (value === undefined) return undefined;
  }
  return value;
}

/**
 * A copy of `root` with `value` at `pointer` (`undefined` removes an object key); every object and array on the way
 * is copied, nothing of `root` changes. `root` itself when the value is already there (the same value, or no key to
 * remove), so an edit that changes nothing is no change: undo records none. Undefined when the pointer is malformed
 * or its parent does not exist, or an array index is out of range.
 */
export function setAt<T>(root: T, pointer: string, value: unknown): T | undefined {
  const tokens = parsePointer(pointer);
  if (tokens === undefined || tokens.length === 0) return undefined;
  return update(root, tokens, value) as T | undefined;
}

function update(node: unknown, tokens: readonly string[], value: unknown): unknown {
  const [token, ...rest] = tokens;
  if (token === undefined) return value;
  if (Array.isArray(node)) {
    const index = arrayIndex(token, node.length);
    if (index === undefined) return undefined;
    const next = update(node[index], rest, value);
    if (next === undefined)
      return rest.length === 0 ? node.filter((_, at) => at !== index) : undefined;
    if (Object.is(next, node[index])) return node;
    return node.map((item: unknown, at) => (at === index ? next : item));
  }
  if (!isRecord(node)) return undefined;
  const has = Object.hasOwn(node, token);
  if (rest.length > 0) {
    const current = child(node, token);
    const next = update(current, rest, value);
    if (next === undefined) return undefined;
    return Object.is(next, current) ? node : withKey(node, token, next);
  }
  if (value === undefined) return has ? withoutKey(node, token) : node;
  return has && Object.is(node[token], value) ? node : withKey(node, token, value);
}

function child(node: unknown, token: string): unknown {
  if (Array.isArray(node)) {
    const index = arrayIndex(token, node.length);
    return index === undefined ? undefined : (node[index] as unknown);
  }
  if (!isRecord(node) || !Object.hasOwn(node, token)) return undefined;
  return node[token];
}

function arrayIndex(token: string, length: number): number | undefined {
  if (!/^(?:0|[1-9][0-9]{0,8})$/u.test(token)) return undefined;
  const index = Number(token);
  return index < length ? index : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A copy keeping the key order, with `key` set (appended when new); `fromEntries` defines own properties only. */
function withKey(
  node: Record<string, unknown>,
  key: string,
  value: unknown,
): Record<string, unknown> {
  const entries = Object.entries(node).map(([name, item]) => [name, name === key ? value : item]);
  if (!Object.hasOwn(node, key)) entries.push([key, value]);
  return Object.fromEntries(entries) as Record<string, unknown>;
}

function withoutKey(node: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(node).filter(([name]) => name !== key));
}
