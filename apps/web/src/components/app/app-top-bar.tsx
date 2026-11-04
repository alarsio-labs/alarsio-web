import Link from "next/link";

// The top bar of every working screen (docs/DESIGN.md section 4): the wordmark and the
// organisation name and role, both back to /dashboard, and Sign out. The caller passes
// the server action, so this file stays a plain component.
export function AppTopBar({
  orgName,
  roleLabel,
  signOut
}: {
  orgName?: string;
  roleLabel?: string;
  signOut: (form: FormData) => void | Promise<void>;
}) {
  return (
    <header className="ax-bar">
      <Link href="/dashboard" className="ax-wordmark" aria-label="Alarsio, dashboard">
        Alar<span>sio</span>
      </Link>
      {orgName && (
        <Link href="/dashboard" className="ax-org" title="Change organisation">
          <span className="ax-org-name">{orgName}</span>
          {roleLabel && <span className="ax-org-role">{roleLabel}</span>}
        </Link>
      )}
      <form action={signOut} className="ax-signout-form">
        <button type="submit" className="ax-btn ax-btn-secondary ax-btn-sm">Sign out</button>
      </form>
    </header>
  );
}
