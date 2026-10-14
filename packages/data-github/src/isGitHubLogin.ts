// 1 to 39 characters: alphanumerics and underscores (Enterprise Managed User logins such as
// `mona_octo`), with single hyphens between them.
const LOGIN_PATTERN = /^[A-Za-z0-9_](?:[A-Za-z0-9_]|-(?=[A-Za-z0-9_])){0,38}$/;

export function isGitHubLogin(text: string): boolean {
  return LOGIN_PATTERN.test(text);
}
