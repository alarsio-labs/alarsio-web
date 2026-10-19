import { describe, expect, it } from "vitest";
import { messageFor } from "./messages";

describe("messageFor", () => {
  it("returns the message for a known code, and nothing for none", () => {
    expect(messageFor("invalid_credentials")).toBe("Email or password is wrong.");
    expect(messageFor(undefined)).toBeNull();
    expect(messageFor("")).toBeNull();
  });

  it("shows the generic message for an unknown code", () => {
    expect(messageFor("made_up")).toBe("Something went wrong. Try again.");
  });

  it("never returns an inherited property for a crafted code", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(messageFor(code)).toBe("Something went wrong. Try again.");
    }
  });
});
