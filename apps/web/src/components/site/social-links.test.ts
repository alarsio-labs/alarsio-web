import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { SOCIAL_LINKS } from "@/lib/site/social";
import { SocialLinks } from "./social-links";

// SocialLinks is a plain function that returns elements, so the test reads the element tree it
// returns. (It does not render with react-dom: the workspace lockfile pairs react 19.2.3 with
// react-dom 19.2.9, and react-dom/server refuses a mismatch.)

type Props = Record<string, unknown> & { children?: ReactNode };

function elements(node: ReactNode, out: ReactElement<Props>[] = []): ReactElement<Props>[] {
  if (Array.isArray(node)) {
    for (const n of node) elements(n, out);
  } else if (isValidElement<Props>(node)) {
    out.push(node);
    elements(node.props.children, out);
  }
  return out;
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return "";
}

const tree = SocialLinks();
const all = elements(tree);
const anchors = all.filter((e) => e.type === "a");
const svgs = all.filter((e) => e.type === "svg");

describe("SocialLinks", () => {
  it("says what the icons are for", () => {
    expect(text(tree)).toContain("Connect with us on");
  });

  it("renders one link per social account, to the right address", () => {
    expect(anchors.map((a) => a.props.href)).toEqual(SOCIAL_LINKS.map((l) => l.href));
  });

  it("opens each one in a new tab without handing over the opener", () => {
    expect(anchors).toHaveLength(SOCIAL_LINKS.length);
    for (const a of anchors) {
      expect(a.props.target).toBe("_blank");
      expect(String(a.props.rel)).toContain("noopener");
      expect(String(a.props.rel)).toContain("noreferrer");
    }
  });

  it("names each link and says it opens a new tab, since the icon has no text", () => {
    expect(anchors.map((a) => a.props["aria-label"])).toEqual(
      SOCIAL_LINKS.map((l) => `Alarsio on ${l.label} (opens in a new tab)`)
    );
  });

  it("hides the drawn icons from screen readers, so the name is read once", () => {
    expect(svgs).toHaveLength(SOCIAL_LINKS.length);
    for (const s of svgs) expect(s.props["aria-hidden"]).toBe("true");
  });
});
