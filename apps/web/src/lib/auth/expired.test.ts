import { describe, expect, it } from "vitest";
import { expiredPath } from "./expired";

describe("expiredPath", () => {
  it("goes to the plain page for a sign-up link with no next", () => {
    expect(expiredPath("email", "/dashboard")).toBe("/link-expired");
    expect(expiredPath(null, "/dashboard")).toBe("/link-expired");
  });

  it("keeps next, so an invite still lands on its invite page", () => {
    expect(expiredPath("signup", "/invite/abc")).toBe("/link-expired?next=%2Finvite%2Fabc");
  });

  it("asks for a reset link when a password link failed", () => {
    expect(expiredPath("recovery", "/update-password")).toBe("/link-expired?for=reset");
  });
});
