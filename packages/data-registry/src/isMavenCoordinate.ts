const COORDINATE = /^[A-Za-z0-9_.-]{1,128}:[A-Za-z0-9_.-]{1,128}$/;

/** Whether `value` is `group:artifact`, each part 1 to 128 of letters, digits, `_`, `.` and `-`. */
export function isMavenCoordinate(value: unknown): value is string {
  return typeof value === "string" && COORDINATE.test(value);
}
