import Link from "next/link";

/** The Alarsio wordmark, linking home. One word part in red (a logo is exempt from contrast). */
export function Wordmark() {
  return (
    <Link href="/" className="lp-display lp-wordmark" aria-label="Alarsio, home">
      Alar<span>sio</span>
    </Link>
  );
}
