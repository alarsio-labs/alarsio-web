// What sign-out says about this user's records the server has not accepted.
// Sign-out is never blocked (ADR-020). Waiting rows (pending, syncing, failed)
// send the next time this user signs in here; rows that need a fix (conflict,
// rejected) do not resend by themselves (ADR-016).

export type UnsentCounts = { waiting: number; needFix: number };

const records = (n: number) => (n === 1 ? '1 record' : `${n} records`);

export function signOutWarning(counts: UnsentCounts | null): string | null {
  if (counts === null) {
    return 'Could not check for records that have not reached the server. If you sign out, anything unsent stays on this phone.';
  }
  const parts: string[] = [];
  if (counts.waiting > 0) {
    parts.push(`${records(counts.waiting)} waiting to send. They stay on this phone and send the next time you sign in here.`);
  }
  if (counts.needFix > 0) {
    parts.push(`${records(counts.needFix)} need a fix before they can be saved. They stay on this phone until you sign in and fix them.`);
  }
  return parts.length > 0 ? parts.join(' ') : null;
}
