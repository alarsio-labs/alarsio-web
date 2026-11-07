import { describe, expect, it } from "vitest";
import { passwordStrength } from "./strength";

describe("passwordStrength", () => {
  it("states the rule when empty and counts what is left when short", () => {
    expect(passwordStrength("")).toEqual({ level: 0, word: "At least 8 characters" });
    expect(passwordStrength("abcdef")).toEqual({ level: 1, word: "2 more characters" });
    expect(passwordStrength("abcdefg")).toEqual({ level: 1, word: "1 more character" });
  });

  it("grows with length and with kinds of character", () => {
    expect(passwordStrength("abcdefgh").level).toBe(2);
    expect(passwordStrength("abcdefghijkl").level).toBe(3);
    expect(passwordStrength("Abcdefg1").level).toBe(3);
    expect(passwordStrength("Abcdefgh1234").level).toBe(4);
  });

  it("follows another minimum length", () => {
    expect(passwordStrength("abcdefgh", 10)).toEqual({ level: 1, word: "2 more characters" });
  });
});
