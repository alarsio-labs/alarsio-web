// The small red mono label above a public page's headline, in brackets: "( About Alarsio )".
// One definition for the home page and About (docs/DESIGN.md section 2); the styles are
// .hm-eyebrow in app/home.css.
export function Eyebrow({ children }: { children: string }) {
  return <p className="hm-eyebrow">( {children} )</p>;
}
