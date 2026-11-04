import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

// Buttons on the working screens (docs/DESIGN.md section 4): at least 44 px, mono
// uppercase. Primary is ink with paper text, secondary an ink outline. There is no
// red button; a destructive action keeps its own confirm step instead.

export type ButtonVariant = "primary" | "secondary";

export function buttonClasses(variant: ButtonVariant = "primary", full = false): string {
  return `ax-btn ax-btn-${variant}${full ? " ax-btn-full" : ""}`;
}

type Common = { variant?: ButtonVariant; full?: boolean; children: ReactNode };

export function Button({ variant, full, children, type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClasses(variant, full)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant, full, children }: Common & { href: string }) {
  return (
    <Link href={href} className={buttonClasses(variant, full)}>
      {children}
    </Link>
  );
}
