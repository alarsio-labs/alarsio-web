/**
 * A rough guide for the new-password bar on the sign-up and reset pages. It only helps the
 * person choose; the rule that is enforced is checkNewPassword() in ./password.ts.
 * Level 0 is empty, 1 is too short, 2 to 4 grow with length and variety.
 */
export type Strength = { level: 0 | 1 | 2 | 3 | 4; word: string };

export function passwordStrength(password: string, minLength = 8): Strength {
  if (password.length === 0) return { level: 0, word: `At least ${minLength} characters` };
  if (password.length < minLength) {
    const left = minLength - password.length;
    return { level: 1, word: `${left} more ${left === 1 ? "character" : "characters"}` };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const score = (password.length >= minLength + 4 ? 1 : 0) + (kinds >= 3 ? 1 : 0);
  if (score === 2) return { level: 4, word: "Strong" };
  if (score === 1) return { level: 3, word: "Good" };
  return { level: 2, word: "OK" };
}
