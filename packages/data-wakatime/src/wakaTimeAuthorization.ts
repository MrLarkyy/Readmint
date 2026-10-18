/** The `Authorization` header value WakaTime takes for an API key: HTTP Basic with the key alone, base64 encoded. */
export function wakaTimeAuthorization(apiKey: string): string {
  return `Basic ${base64(apiKey.trim())}`;
}

/**
 * Every form of `apiKey` a host must keep out of its logs and outputs: as given, trimmed, the base64 sent (with and
 * without its padding) and the whole header value. Empty forms are left out.
 */
export function wakaTimeSecretForms(apiKey: string): string[] {
  const trimmed = apiKey.trim();
  if (trimmed === "") return apiKey === "" ? [] : [apiKey];
  const encoded = base64(trimmed);
  const forms = [apiKey, trimmed, encoded, encoded.replace(/=+$/, ""), `Basic ${encoded}`];
  return [...new Set(forms)];
}

// btoa takes Latin-1 only; a key with any other character is refused before this is called, and a host may pass one
// as it is: its UTF-8 bytes are encoded then.
function base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
