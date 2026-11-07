/**
 * Where an email link that cannot be used goes (app/auth/confirm/route.ts): the "Link expired"
 * page, which offers a new link of the same kind (a password reset, or the sign-up
 * confirmation) and keeps `next` so an invite still lands on its invite page.
 */
export function expiredPath(type: string | null, next: string): string {
  const q = new URLSearchParams();
  if (type === "recovery") q.set("for", "reset");
  else if (next !== "/dashboard") q.set("next", next);
  const s = q.toString();
  return s ? `/link-expired?${s}` : "/link-expired";
}
