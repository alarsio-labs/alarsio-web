import { beforeEach, describe, expect, it, vi } from "vitest";

// Sign-in, sign-up, password reset and sign-out (#141). The Supabase client is a fake
// that records each auth call and returns what the test sets; every way out of an
// action is a redirect, so the tests read where it went.

type AuthError = { code?: string } | null;
const sb = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown[] }[],
  signIn: { data: { user: null as { id: string } | null }, error: null as AuthError },
  signUp: { error: null as AuthError },
  getUser: { data: { user: null as { id: string } | null } },
  updateUser: { error: null as AuthError },
  resend: { error: null as AuthError },
  profiles: [] as string[]
}));

// The cookie jar the actions write to (next/headers). An invite opened before sign-up
// is kept here, so a sign-in that lost `next` can still find it (the reviewer setup on 13 Nov).
type CookieOptions = Record<string, unknown>;
const jar = vi.hoisted(() => ({
  set: [] as { name: string; value: string; options: CookieOptions }[],
  deleted: [] as string[]
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string, options: CookieOptions) => {
      jar.set.push({ name, value, options });
    },
    delete: (name: string) => {
      jar.deleted.push(name);
    }
  })
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ url: "https://db.test", key: "k", siteUrl: "https://app.test" }) }));
vi.mock("@/lib/profile", () => ({
  ensureProfile: async (_s: unknown, user: { id: string }) => {
    sb.profiles.push(user.id);
  }
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: {
      signInWithPassword: async (...args: unknown[]) => (sb.calls.push({ fn: "signInWithPassword", args }), sb.signIn),
      signUp: async (...args: unknown[]) => (sb.calls.push({ fn: "signUp", args }), sb.signUp),
      resetPasswordForEmail: async (...args: unknown[]) => (sb.calls.push({ fn: "resetPasswordForEmail", args }), { error: { code: "over_email_send_rate_limit" } }),
      resend: async (...args: unknown[]) => (sb.calls.push({ fn: "resend", args }), sb.resend),
      getUser: async () => sb.getUser,
      updateUser: async (...args: unknown[]) => (sb.calls.push({ fn: "updateUser", args }), sb.updateUser),
      signOut: async () => (sb.calls.push({ fn: "signOut", args: [] }), { error: null })
    }
  })
}));

const { requestPasswordReset, resendConfirmation, signIn, signOut, signUp, updatePassword } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function target(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const m = /^REDIRECT (.*)$/.exec(error instanceof Error ? error.message : "");
    if (m?.[1]) return m[1];
    throw error;
  }
  throw new Error("the action did not redirect");
}

const called = (fn: string) => sb.calls.filter((c) => c.fn === fn);

beforeEach(() => {
  sb.calls.length = 0;
  sb.profiles.length = 0;
  sb.signIn = { data: { user: { id: "u1" } }, error: null };
  sb.signUp = { error: null };
  sb.getUser = { data: { user: { id: "u1" } } };
  sb.updateUser = { error: null };
  sb.resend = { error: null };
  jar.set.length = 0;
  jar.deleted.length = 0;
});

describe("an invite opened before signing up or in", () => {
  const TOKEN = "c".repeat(64);
  const invite = `/invite/${TOKEN}`;
  const newUser = { full_name: "Vikas Yadav", email: "vikas@example.com", password: "longenough", terms: "on" };
  const member = { email: "vikas@example.com", password: "correct horse" };
  const remembered = () => jar.set.filter((c) => c.name === "alarsio_invite");

  it("is remembered on sign-up, for 72 hours like the invite itself", async () => {
    await target(() => signUp(form({ ...newUser, next: invite })));
    expect(remembered()).toHaveLength(1);
    expect(remembered()[0]?.value).toBe(TOKEN);
    expect(remembered()[0]?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 72 * 60 * 60 });
  });

  it("is remembered on sign-in and when the confirmation email is sent again", async () => {
    await target(() => signIn(form({ ...member, next: invite })));
    await target(() => resendConfirmation(form({ email: "vikas@example.com", next: invite })));
    expect(remembered().map((c) => c.value)).toEqual([TOKEN, TOKEN]);
  });

  it("is not set for any other next, or for a malformed invite path", async () => {
    await target(() => signUp(form({ ...newUser, next: "/team?org=o1" })));
    await target(() => signIn(form({ ...member, next: "/dashboard" })));
    await target(() => signIn(form({ ...member, next: "/invite/abc" })));
    expect(remembered()).toHaveLength(0);
  });
});

describe("signIn", () => {
  const good = { email: "  Owner@Example.COM ", password: "correct horse" };

  it("ignores a next that leaves the site, and lands on the dashboard", async () => {
    for (const next of ["https://evil.test/x", "//evil.test", "/\\evil.test", "javascript:alert(1)"]) {
      expect(await target(() => signIn(form({ ...good, next })))).toBe("/dashboard");
    }
  });

  it("shows the wrong-password message and keeps a safe next", async () => {
    sb.signIn = { data: { user: null }, error: { code: "invalid_credentials" } };
    expect(await target(() => signIn(form({ ...good, next: "/sites?org=o1" })))).toBe(
      "/sign-in?error=invalid_credentials&next=%2Fsites%3Forg%3Do1"
    );
    expect(sb.profiles).toEqual([]);
  });

  it("says the email is not confirmed when Supabase says so", async () => {
    sb.signIn = { data: { user: null }, error: { code: "email_not_confirmed" } };
    expect(await target(() => signIn(form(good)))).toBe("/sign-in?error=email_not_confirmed");
  });

  it("refuses an empty email or password without calling Supabase", async () => {
    expect(await target(() => signIn(form({ email: "", password: "x" })))).toBe("/sign-in?error=missing_fields");
    expect(await target(() => signIn(form({ email: "a@b.co", password: "" })))).toBe("/sign-in?error=missing_fields");
    expect(called("signInWithPassword")).toHaveLength(0);
  });

  it("signs in with the trimmed, lower-cased email, makes the profile and goes to next", async () => {
    expect(await target(() => signIn(form({ ...good, next: "/reports?org=o1" })))).toBe("/reports?org=o1");
    expect(called("signInWithPassword")[0]?.args[0]).toEqual({ email: "owner@example.com", password: "correct horse" });
    expect(sb.profiles).toEqual(["u1"]);
  });
});

describe("signUp", () => {
  const good = { full_name: "Asha Patil", email: "Asha@Example.com", password: "longenough", terms: "on" };
  const redirectTo = () => (called("signUp")[0]?.args[0] as { options: { emailRedirectTo: string } }).options.emailRedirectTo;

  it("ignores a next that leaves the site in the verification link", async () => {
    expect(await target(() => signUp(form({ ...good, next: "https://evil.test" })))).toBe("/check-email");
    expect(redirectTo()).toBe("https://app.test/auth/confirm?next=%2Fdashboard");
  });

  it("refuses missing fields, a short password and an unticked agreement before calling Supabase", async () => {
    expect(await target(() => signUp(form({ ...good, full_name: " " })))).toBe("/sign-up?error=missing_fields");
    expect(await target(() => signUp(form({ ...good, password: "short" })))).toBe("/sign-up?error=weak_password");
    expect(await target(() => signUp(form({ ...good, terms: "" })))).toBe("/sign-up?error=terms_required");
    expect(called("signUp")).toHaveLength(0);
  });

  it("does not reveal that an email already has an account", async () => {
    sb.signUp = { error: { code: "user_already_exists" } };
    expect(await target(() => signUp(form(good)))).toBe("/check-email");
  });

  it("shows a failure for any other error", async () => {
    sb.signUp = { error: { code: "unexpected_failure" } };
    expect(await target(() => signUp(form({ ...good, next: "/team" })))).toBe("/sign-up?error=sign_up_failed&next=%2Fteam");
  });

  it("signs up with the name and a verification link that keeps a safe next", async () => {
    expect(await target(() => signUp(form({ ...good, next: "/team?org=o1" })))).toBe("/check-email?next=%2Fteam%3Forg%3Do1");
    const args = called("signUp")[0]?.args[0] as { email: string; options: { data: { full_name: string } } };
    expect(args.email).toBe("asha@example.com");
    expect(args.options.data.full_name).toBe("Asha Patil");
    expect(redirectTo()).toBe("https://app.test/auth/confirm?next=%2Fteam%3Forg%3Do1");
  });
});

describe("resendConfirmation", () => {
  const sentTo = () => called("resend")[0]?.args[0] as { type: string; email: string; options: { emailRedirectTo: string } };

  it("refuses an address that is not an email, back on the page it came from", async () => {
    expect(await target(() => resendConfirmation(form({ email: "nope" })))).toBe("/check-email?error=missing_fields");
    expect(await target(() => resendConfirmation(form({ email: "nope", from: "expired", next: "/team" })))).toBe(
      "/link-expired?error=missing_fields&next=%2Fteam"
    );
    expect(called("resend")).toHaveLength(0);
  });

  it("sends the sign-up email again with a link that keeps a safe next", async () => {
    expect(await target(() => resendConfirmation(form({ email: " Asha@Example.com ", next: "/invite/abc" })))).toBe(
      "/check-email?sent=1&next=%2Finvite%2Fabc"
    );
    expect(sentTo().type).toBe("signup");
    expect(sentTo().email).toBe("asha@example.com");
    expect(sentTo().options.emailRedirectTo).toBe("https://app.test/auth/confirm?next=%2Finvite%2Fabc");
  });

  it("drops a next that leaves the site", async () => {
    expect(await target(() => resendConfirmation(form({ email: "a@b.co", next: "https://evil.test" })))).toBe("/check-email?sent=1");
    expect(sentTo().options.emailRedirectTo).toBe("https://app.test/auth/confirm?next=%2Fdashboard");
  });

  it("says the same for an unknown address or any other failure", async () => {
    sb.resend = { error: { code: "user_not_found" } };
    expect(await target(() => resendConfirmation(form({ email: "a@b.co" })))).toBe("/check-email?sent=1");
  });

  it("asks to wait when Supabase limits how often it sends", async () => {
    sb.resend = { error: { code: "over_email_send_rate_limit" } };
    expect(await target(() => resendConfirmation(form({ email: "a@b.co", from: "expired" })))).toBe("/link-expired?error=resend_rate");
  });
});

describe("requestPasswordReset", () => {
  it("refuses an address that is not an email", async () => {
    expect(await target(() => requestPasswordReset(form({ email: "not-an-email" })))).toBe("/forgot-password?error=missing_fields");
    expect(called("resetPasswordForEmail")).toHaveLength(0);
  });

  it("shows the same page even when sending fails, and links to /update-password", async () => {
    expect(await target(() => requestPasswordReset(form({ email: "A@B.co" })))).toBe("/check-email?for=reset");
    const [email, opts] = called("resetPasswordForEmail")[0]?.args as [string, { redirectTo: string }];
    expect(email).toBe("a@b.co");
    expect(opts.redirectTo).toBe("https://app.test/auth/confirm?next=%2Fupdate-password");
  });
});

describe("updatePassword", () => {
  it("refuses a short or mismatched password before calling Supabase", async () => {
    expect(await target(() => updatePassword(form({ password: "short", confirm: "short" })))).toBe("/update-password?error=weak_password");
    expect(await target(() => updatePassword(form({ password: "longenough", confirm: "different1" })))).toBe(
      "/update-password?error=password_mismatch"
    );
    expect(called("updateUser")).toHaveLength(0);
  });

  it("sends a visitor with no recovery session back to request a new link", async () => {
    sb.getUser = { data: { user: null } };
    expect(await target(() => updatePassword(form({ password: "longenough", confirm: "longenough" })))).toBe(
      "/link-expired?for=reset"
    );
    expect(called("updateUser")).toHaveLength(0);
  });

  it("shows a failure when Supabase refuses the change", async () => {
    sb.updateUser = { error: { code: "same_password" } };
    expect(await target(() => updatePassword(form({ password: "longenough", confirm: "longenough" })))).toBe(
      "/update-password?error=update_password_failed"
    );
  });

  it("sets the new password and goes to the dashboard", async () => {
    expect(await target(() => updatePassword(form({ password: "longenough", confirm: "longenough" })))).toBe("/dashboard");
    expect(called("updateUser")[0]?.args[0]).toEqual({ password: "longenough" });
  });
});

describe("signOut", () => {
  it("signs out and goes to sign-in", async () => {
    expect(await target(() => signOut())).toBe("/sign-in");
    expect(called("signOut")).toHaveLength(1);
  });
});
