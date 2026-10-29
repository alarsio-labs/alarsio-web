import type { CSSProperties, ElementType } from "react";

// Splits a line into word spans at render time, so every word can rise on its own
// stagger (docs/DESIGN.md, per-word motion). The words stay real text, in order,
// with real spaces between them.
export function Words({
  text,
  as: Tag = "span",
  className,
  id,
  style
}: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  style?: CSSProperties;
}) {
  const words = text.split(" ");
  return (
    <Tag id={id} className={`lp-words ${className ?? ""}`} style={style} data-rev="">
      {words.map((w, i) => (
        <span key={i}>
          <span className="lp-w" style={{ ["--i" as string]: i }}>{w}</span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </Tag>
  );
}
