// What sign-out says about records not yet sent. Sign-out is never blocked
// (ADR-020): the rows stay on the phone and go when their author signs in again.

export function signOutWarning(unsent: number): string | null {
  if (unsent <= 0) return null;
  const records = unsent === 1 ? '1 record' : `${unsent} records`;
  return `${records} you saved ${unsent === 1 ? 'has' : 'have'} not reached the server yet. ` +
    'They stay on this phone and send the next time you sign in here.';
}
