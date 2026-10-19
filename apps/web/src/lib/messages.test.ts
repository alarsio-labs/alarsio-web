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

  it("has a message for each materials code, and none of them is the generic one", () => {
    const codes = ["material_name", "material_unit", "material_threshold", "material_exists", "material_forbidden", "material_not_found"];
    for (const code of codes) {
      expect(messageFor(code)).not.toBeNull();
      expect(messageFor(code)).not.toBe(messageFor("made_up"));
    }
    expect(messageFor("material_exists")).toBe("This site already has a material with that name.");
  });

  it("never returns an inherited property for a crafted code", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(messageFor(code)).toBe("Something went wrong. Try again.");
    }
  });
});
