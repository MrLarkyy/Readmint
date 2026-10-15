/** The first `# ` heading of a template README. */
export function readmeTitle(readme: string, template: string): string {
  const title = /^# (.+)$/m.exec(readme)?.[1]?.trim();
  if (title === undefined || title === "") throw new Error(`${template}/README.md: no "# " title`);
  return title;
}
