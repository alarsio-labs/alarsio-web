import "server-only";
import nodemailer from "nodemailer";

// Sends mail from the organisation's own mailbox over SMTP (ADR-019, I7).
// Credentials are server-only env vars: never NEXT_PUBLIC_, never in git.
// Returns false instead of throwing, so a mail failure never loses an invite:
// the owner still gets the link to copy.
export async function sendMail(message: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM;
  if (!host || !user || !pass || !from || !Number.isInteger(port)) return false;

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    await transport.sendMail({ from, ...message });
    return true;
  } catch {
    return false;
  }
}
