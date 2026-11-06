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
  revalidated: [] as string[]
}));

vi.mock("server-only", () => ({}));
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
      return fn === "create_invite" ? db.invite : { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            db.reads.push(table);
            return { data: table === "organizations" ? { name: "Shree Builders" } : { full_name: "Ravi Kulkarni" } };
          }
        })
      })
    }),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) }
  })
}));

const { createInvite, revokeInvite } = await import("./actions");

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const INVITE = "b1000000-0000-4000-8000-000000000001";
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
  db.invite = { data: "f".repeat(64), error: null };
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
      ["23505", "That person is already a member, or already has an open invite."],
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

describe("revokeInvite", () => {
  it("ignores a malformed invite id", async () => {
    await revokeInvite(form({ invite_id: "nope" }));
    expect(db.rpcs).toHaveLength(0);
  });

  it("revokes through the database function and refreshes the team page", async () => {
    await revokeInvite(form({ invite_id: INVITE }));
    expect(db.rpcs).toEqual([{ fn: "revoke_invite", args: { p_invite_id: INVITE } }]);
    expect(db.revalidated).toEqual(["/team"]);
  });
});
