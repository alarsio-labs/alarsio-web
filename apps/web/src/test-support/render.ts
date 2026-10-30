import { Fragment, isValidElement, type ReactNode } from "react";

// A small static renderer for these server components. react-dom/server is not used:
// the repo's react (19.2.3) and react-dom (19.2.9) differ, and react-dom/server refuses
// to run on a mismatch. These components are plain functions with no hooks.
const attr = (k: string) => (k === "className" ? "class" : k === "htmlFor" ? "for" : k);
export function renderStatic(node: ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderStatic).join("");
  if (!isValidElement(node)) return "";
  const { type } = node;
  const props = node.props as Record<string, unknown> & { children?: ReactNode };
  if (type === Fragment) return renderStatic(props.children);
  if (typeof type === "function") return renderStatic((type as (p: unknown) => ReactNode)(props));
  const attrs = Object.entries(props)
    .filter(([k, v]) => k !== "children" && v !== undefined && v !== null && v !== false)
    .map(([k, v]) =>
      k === "style"
        ? ` style="${Object.entries(v as Record<string, unknown>).map(([sk, sv]) => `${sk.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof sv === "number" ? `${sv}px` : String(sv)}`).join(";")}"`
        : ` ${attr(k)}="${String(v)}"`
    )
    .join("");
  return `<${String(type)}${attrs}>${renderStatic(props.children)}</${String(type)}>`;
}
