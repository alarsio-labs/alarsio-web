import { beforeEach, describe, expect, it, vi } from "vitest";

// Creating and revoking invites (#141). create_invite checks the caller is an owner
// and returns the token; the action builds the link, tries to email it, and always
// returns the link so the owner can copy it.

const db = vi.hoisted(() => ({
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  invite: { data: "f".repeat(64) as unknown, error: null as { code?: string } | null },
  reads: [] as string[],
  mails: [] as { to: string; subject: string; text: string }[],
  mailOk: true,
  revoke: null as { code?: string } | null,
  resend: { data: "e".repeat(64) as unknown, error: null as { code?: string } | null },
  oldInvite: { email: "Old@Example.com", role: "accountant" } as { email: string; role: string } | null,
  role: null as { code?: string } | null,
  revalidated: [] as string[]
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }
}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => db.revalidated.push(p) }));
vi.mock("@/lib/env", () => ({ publicEnv: () => ({ url: "https://db.test", key: "k", siteUrl: "https://app.test" }) }));
vi.mock("@/lib/email/send", () => ({
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    db.mails.push(m);
    return db.mailOk;
  }
}));
// Reads only through select(...).eq(...).maybeSingle(); there is no insert, update
// or delete on this client, so the tests also prove the action writes no table.
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      db.rpcs.push({ fn, args });
      if (fn === "create_invite") return db.invite;
      if (fn === "resend_invite") return db.resend;
      return { data: null, error: fn === "revoke_invite" ? db.revoke : fn === "change_member_role" ? db.role : null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            db.reads.push(table);
            if (table === "invites") return { data: db.oldInvite };
            return { data: table === "organizations" ? { name: "Shree Builders" } : { full_name: "Ravi Kulkarni" } };
          }
        })
      })
    }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }
  })
}));

const { changeRole, createInvite, resendInvite, revokeInvite } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const INVITE = "b1000000-0000-4000-8000-000000000001";
const MEMBER = "c2000000-0000-4000-8000-000000000002";
const idle = { status: "idle" } as const;
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const invite = (over: Record<string, string> = {}) => form({ org_id: ORG, email: " Supervisor@Example.com ", role: "supervisor", ...over });

beforeEach(() => {
  db.rpcs.length = 0;
  db.reads.length = 0;
  db.mails.length = 0;
  db.revalidated.length = 0;
  db.mailOk = true;
  db.revoke = null;
  db.role = null;
  db.invite = { data: "f".repeat(64), error: null };
  db.resend = { data: "e".repeat(64), error: null };
  db.oldInvite = { email: "Old@Example.com", role: "accountant" };
});

describe("createInvite", () => {
  it("refuses a role outside the four", async () => {
    for (const role of ["admin", "site_engineer", "", "Owner"]) {
      expect(await createInvite(idle, invite({ role }))).toEqual({ status: "error", message: "Choose a role." });
    }
    expect(db.rpcs).toHaveLength(0);
  });

  it("refuses an unknown organisation id or an empty email before calling the database", async () => {
    expect(await createInvite(idle, invite({ org_id: "not-a-uuid" }))).toEqual({ status: "error", message: "Unknown organisation." });
    expect(await createInvite(idle, invite({ email: "  " }))).toEqual({ status: "error", message: "Enter an email address." });
    expect(db.rpcs).toHaveLength(0);
  });

  it("shows the refusal when the caller is not an owner (42501), and sends nothing", async () => {
    db.invite = { data: null, error: { code: "42501" } };
    expect(await createInvite(idle, invite())).toEqual({ status: "error", message: "Only an owner of this organisation can invite." });
    expect(db.mails).toHaveLength(0);
  });

  it("names the other refusals the database gives", async () => {
    const cases: [string, string][] = [
      ["PT409", "That person is already a member. To change their role, use the Members list."],
      ["23505", "That email already has an open invite. Resend it from the Invites list, or revoke it first."],
      ["22023", "Enter a valid email address."],
      ["PT429", "Too many invites in the last hour. Try again later."],
      ["XX000", "Could not create the invite. Try again."]
    ];
    for (const [code, message] of cases) {
      db.invite = { data: null, error: { code } };
      expect(await createInvite(idle, invite())).toEqual({ status: "error", message });
    }
  });

  it("still returns the copyable link when the email fails to send", async () => {
    db.mailOk = false;
    const out = await createInvite(idle, invite());
    expect(out).toEqual({ status: "sent", email: "supervisor@example.com", link: `https://app.test/invite/${"f".repeat(64)}`, emailed: false });
  });

  it("creates the invite, emails the link and refreshes the team page", async () => {
    const out = await createInvite(idle, invite());
    expect(db.rpcs).toEqual([{ fn: "create_invite", args: { p_org_id: ORG, p_email: "supervisor@example.com", p_role: "supervisor" } }]);
    expect(out).toMatchObject({ status: "sent", emailed: true });
    expect(db.mails).toHaveLength(1);
    expect(db.mails[0]?.to).toBe("supervisor@example.com");
    expect(db.mails[0]?.text).toContain(`https://app.test/invite/${"f".repeat(64)}`);
    expect(db.revalidated).toEqual(["/team"]);
  });
});

describe("resendInvite", () => {
  const resend = (over: Record<string, string> = {}) => form({ org_id: ORG, invite_id: INVITE, ...over });

  it("refuses a malformed invite or organisation id before calling the database", async () => {
    expect(await resendInvite(idle, resend({ invite_id: "nope" }))).toEqual({ status: "error", message: "Unknown invite." });
    expect(await resendInvite(idle, resend({ org_id: "nope" }))).toEqual({ status: "error", message: "Unknown invite." });
    expect(db.rpcs).toHaveLength(0);
  });

  it("mails the new link to the invite's own address, not one from the form", async () => {
    const out = await resendInvite(idle, resend({ email: "attacker@example.com", role: "owner" }));
    expect(db.rpcs).toEqual([{ fn: "resend_invite", args: { p_invite_id: INVITE } }]);
    expect(out).toEqual({ status: "sent", email: "Old@Example.com", link: `https://app.test/invite/${"e".repeat(64)}`, emailed: true });
    expect(db.mails.map((m) => m.to)).toEqual(["Old@Example.com"]);
    expect(db.revalidated).toEqual(["/team"]);
  });

  it("says so when the invite is not found, and sends nothing", async () => {
    db.oldInvite = null;
    expect(await resendInvite(idle, resend())).toEqual({ status: "error", message: "Unknown invite." });
    expect(db.rpcs).toHaveLength(0);
  });

  it("shows the database's refusal and sends nothing", async () => {
    for (const [code, message] of [
      ["42501", "Only an owner of this organisation can invite."],
      ["PT409", "That person is already a member. To change their role, use the Members list."],
      ["PT429", "Too many invites in the last hour. Try again later."]
    ] as const) {
      db.resend = { data: null, error: { code } };
      expect(await resendInvite(idle, resend())).toEqual({ status: "error", message });
    }
    expect(db.mails).toHaveLength(0);
  });
});

describe("changeRole", () => {
  const change = (over: Record<string, string> = {}) => form({ org_id: ORG, user_id: MEMBER, role: "project_manager", ...over });

  it("ignores a malformed id or a role outside the four", async () => {
    await changeRole(change({ org_id: "nope" }));
    await changeRole(change({ user_id: "nope" }));
    for (const role of ["admin", "site_engineer", "", "Owner"]) await changeRole(change({ role }));
    expect(db.rpcs).toHaveLength(0);
  });

  it("changes the role through the database function and refreshes the team page", async () => {
    await changeRole(change());
    expect(db.rpcs).toEqual([{ fn: "change_member_role", args: { p_org_id: ORG, p_user_id: MEMBER, p_role: "project_manager" } }]);
    expect(db.revalidated).toEqual(["/team"]);
  });

  it("says an organisation needs an owner when the database refuses to remove the last one", async () => {
    db.role = { code: "PT422" };
    await expect(changeRole(change({ role: "supervisor" }))).rejects.toThrow(`REDIRECT /team?org=${ORG}&error=last_owner`);
  });

  it("goes back to the team page with an error for any other refusal", async () => {
    db.role = { code: "42501" };
    await expect(changeRole(change())).rejects.toThrow(`REDIRECT /team?org=${ORG}&error=role_change_failed`);
  });
});

describe("revokeInvite", () => {
  it("ignores a malformed invite or organisation id", async () => {
    await revokeInvite(form({ org_id: ORG, invite_id: "nope" }));
    await revokeInvite(form({ org_id: "nope", invite_id: INVITE }));
    expect(db.rpcs).toHaveLength(0);
  });

  it("revokes through the database function and refreshes the team page", async () => {
    await revokeInvite(form({ org_id: ORG, invite_id: INVITE }));
    expect(db.rpcs).toEqual([{ fn: "revoke_invite", args: { p_invite_id: INVITE } }]);
    expect(db.revalidated).toEqual(["/team"]);
  });

  it("goes back to the team page with an error when the database refuses", async () => {
    db.revoke = { code: "XX000" };
    await expect(revokeInvite(form({ org_id: ORG, invite_id: INVITE }))).rejects.toThrow(`REDIRECT /team?org=${ORG}&error=revoke_failed`);
  });
});
