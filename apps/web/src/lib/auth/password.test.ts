import { describe, expect, it } from "vitest";
import { checkNewPassword } from "./password";

describe("checkNewPassword", () => {
  it("accepts 8 characters or more that match", () => {
    expect(checkNewPassword("12345678", "12345678")).toBeNull();
    expect(checkNewPassword("a much longer passphrase", "a much longer passphrase")).toBeNull();
  });

  it("rejects fewer than 8 characters, even when both fields match", () => {
    expect(checkNewPassword("1234567", "1234567")).toBe("weak_password");
    expect(checkNewPassword("", "")).toBe("weak_password");
  });

  it("rejects two different passwords", () => {
    expect(checkNewPassword("12345678", "12345679")).toBe("password_mismatch");
    expect(checkNewPassword("12345678", "")).toBe("password_mismatch");
  });

  it("reports a short password before a mismatch", () => {
    expect(checkNewPassword("123", "456")).toBe("weak_password");
  });

  it("checks the length only when there is no confirmation field", () => {
    expect(checkNewPassword("12345678")).toBeNull();
    expect(checkNewPassword("1234567")).toBe("weak_password");
  });

  it("does not trim: spaces count as characters", () => {
    expect(checkNewPassword("        ", "        ")).toBeNull();
    expect(checkNewPassword("abc ", "abc")).toBe("weak_password");
  });
});
