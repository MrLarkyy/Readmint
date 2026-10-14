// 1 to 39 characters: alphanumerics and underscores (Enterprise Managed User logins such as
// `mona_octo`), with single hyphens between them.
const LOGIN_PATTERN = /^[A-Za-z0-9_](?:[A-Za-z0-9_]|-(?=[A-Za-z0-9_])){0,38}$/;
const BOT_SUFFIX = "[bot]";

/** A user login, as the `login` option and `user(login:)` take it. */
export function isGitHubLogin(text: string): boolean {
  return LOGIN_PATTERN.test(text);
}

/**
 * The owner of a token: a user login, or an app's bot login such as `github-actions[bot]`
 * (the owner of an Actions or other app installation token).
 */
export function isTokenOwnerLogin(text: string): boolean {
  const name = text.endsWith(BOT_SUFFIX) ? text.slice(0, -BOT_SUFFIX.length) : text;
  return isGitHubLogin(name);
}
