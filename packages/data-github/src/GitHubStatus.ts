/** The status the user set on the profile. */
export interface GitHubStatus {
  readonly message: string | null;
  /** Emoji as a GitHub shortcode such as `:rocket:`. */
  readonly emoji: string | null;
}
