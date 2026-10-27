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

  it("has a message for each attendance review code, and none of them is the generic one", () => {
    const codes = [
      "attendance_forbidden",
      "attendance_reason_required",
      "attendance_reason_long",
      "attendance_day_final",
      "attendance_correction_stale"
    ];
    for (const code of codes) {
      expect(messageFor(code)).not.toBeNull();
      expect(messageFor(code)).not.toBe(messageFor("made_up"));
    }
    expect(messageFor("attendance_reason_required")).toBe("Enter a reason of 1 to 500 characters to reject.");
  });

  it("has its own message for each sites code", () => {
    const codes = [
      "site_name",
      "site_address",
      "site_latitude",
      "site_longitude",
      "site_radius",
      "site_status",
      "site_exists",
      "site_forbidden",
      "site_not_allowed",
      "assign_exists",
      "assign_archived",
      "assign_member",
      "assign_not_allowed"
    ];
    const texts = new Set<string | null>();
    for (const code of codes) {
      expect(messageFor(code)).not.toBeNull();
      expect(messageFor(code)).not.toBe(messageFor("made_up"));
      texts.add(messageFor(code));
    }
    expect(texts.size).toBe(codes.length);
    expect(messageFor("site_not_allowed")).toMatch(/not allowed/i);
    expect(messageFor("site_exists")).toMatch(/already exists/i);
  });

  it("never returns an inherited property for a crafted code", () => {
    for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(messageFor(code)).toBe("Something went wrong. Try again.");
    }
  });
});
