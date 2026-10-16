import { DataSourceError } from "@readmint/data";

export interface ResolvedHeaders {
  readonly headers: Readonly<Record<string, string>>;
  /** Every value sent, for redaction of anything that might echo one. */
  readonly secrets: readonly string[];
}

// Printable ASCII and space: CR or LF could inject a header, and fetch quotes a value it rejects.
const HEADER_VALUE = /^[\x20-\x7e]+$/;

/**
 * Reads each header value from `env` by the variable name the host gave. Errors name the variable
 * and the header, never a value.
 */
export function resolveHeaders(
  namespace: string,
  headerEnv: readonly (readonly [string, string])[],
  env: Readonly<Record<string, string | undefined>> | undefined,
): ResolvedHeaders {
  const headers: Record<string, string> = {};
  const secrets: string[] = [];
  for (const [name, envName] of headerEnv) {
    const raw = env !== undefined && Object.hasOwn(env, envName) ? env[envName] : undefined;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value === "") {
      throw new DataSourceError(
        namespace,
        "missing-token",
        `The environment variable ${envName} for header ${name} is not set.`,
      );
    }
    secrets.push(value);
    if (!HEADER_VALUE.test(value)) {
      throw new DataSourceError(
        namespace,
        "invalid-option",
        `The environment variable ${envName} for header ${name} holds characters a header value cannot have (control or non-ASCII).`,
      );
    }
    headers[name] = value;
  }
  return { headers, secrets };
}
