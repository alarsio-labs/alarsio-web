// The one rule for a new password, shared by sign-up and "set a new password".
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordProblem = "weak_password" | "password_mismatch";

/**
 * Null when the password is acceptable. Pass `confirm` when the form asks for the password twice;
 * leave it out (sign-up) to check the length only. The password is never trimmed.
 */
export function checkNewPassword(password: string, confirm?: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "weak_password";
  if (confirm !== undefined && password !== confirm) return "password_mismatch";
  return null;
}
