// 1 to 39 characters, alphanumerics and single inner hyphens, as GitHub allows for user names.
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

export function isGitHubLogin(text: string): boolean {
  return LOGIN_PATTERN.test(text);
}
