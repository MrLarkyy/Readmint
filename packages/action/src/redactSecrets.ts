/**
 * `text` with every secret, its base64 form and the base64 of the `x-access-token:` basic
 * credential built from it replaced by `***`. Secrets shorter than 4 characters are ignored:
 * replacing them would mangle ordinary text and they are no real token.
 */
export function redactSecrets(text: string, secrets: readonly string[]): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    for (const form of secretForms(secret)) result = result.split(form).join("***");
  }
  return result;
}

function secretForms(secret: string): string[] {
  const base64 = (value: string) => Buffer.from(value, "utf8").toString("base64");
  // Longest first: the base64 of the secret can be a part of the credential's base64.
  return [base64(`x-access-token:${secret}`), base64(secret), secret];
}
