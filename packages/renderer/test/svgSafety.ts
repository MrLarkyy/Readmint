/**
 * Problems that would make an SVG unsafe or not self-contained on GitHub: script or foreignObject elements,
 * event attributes, `@import`, any href or `url()` (so also any `javascript:` URL) that is not a fragment or an
 * inlined data URI of an accepted type, and any fragment that names no id of the same document. Text nodes and
 * plain attribute values (an aria-label) are inert.
 */
export function svgSafetyProblems(svg: string): string[] {
  const problems: string[] = [];
  const ids = new Set([...svg.matchAll(/\sid="([^"]*)"/gu)].map((match) => match[1] ?? ""));
  const fragment = (target: string, where: string) => {
    if (!ids.has(target.slice(1))) problems.push(`${where} names no id: ${target.slice(0, 40)}`);
  };
  const styles = [...svg.matchAll(/<style>([\s\S]*?)<\/style>/gu)].map((match) => match[1] ?? "");
  for (const css of styles) {
    if (/@import/iu.test(css)) problems.push("@import in a style");
    for (const url of css.matchAll(/url\(([^)]*)\)/gu)) {
      const target = url[1] ?? "";
      if (target.startsWith("#")) fragment(target, "style url()");
      else if (!/^data:font\/woff;base64,[A-Za-z0-9+/=]+$/u.test(target)) {
        problems.push(`style url(${target.slice(0, 40)})`);
      }
    }
  }
  for (const tag of svg.matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*)>/gu)) {
    const name = (tag[1] ?? "").toLowerCase();
    const attributes = tag[2] ?? "";
    if (name === "script" || name === "foreignobject") problems.push(`<${name}> element`);
    for (const attribute of attributes.matchAll(/\s([\w:-]+)="([^"]*)"/gu)) {
      const key = (attribute[1] ?? "").toLowerCase();
      const value = attribute[2] ?? "";
      if (key.startsWith("on")) problems.push(`event attribute ${key}`);
      if (key === "href" || key === "xlink:href") {
        if (/^#[A-Za-z][\w-]*$/u.test(value)) fragment(value, key);
        else if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/u.test(value)) {
          problems.push(`${key}=${value.slice(0, 40)}`);
        }
      }
      for (const url of value.matchAll(/url\(([^)]*)\)/gu)) {
        const target = url[1] ?? "";
        if (target.startsWith("#")) fragment(target, `url() in ${key}`);
        else problems.push(`url() in ${key}`);
      }
    }
  }
  return problems;
}
