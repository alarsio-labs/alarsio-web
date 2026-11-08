"use server";

import { sendMail } from "@/lib/email/send";
import { checkEnquiry, enquiryEmail, looksLikeBot, valuesOf, type EnquiryField, type EnquiryValues } from "@/lib/site/enquiry";

export type EnquiryState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "invalid"; errors: Partial<Record<EnquiryField, string>>; values: EnquiryValues }
  | { status: "failed"; values: EnquiryValues };

// Emails the enquiry to ENQUIRY_TO_EMAIL through the same SMTP mailbox as invites
// (lib/email/send.ts). Nothing is written to the database: the landing owns no table.
// A bot gets the same "sent" answer as a person, so it learns nothing from the reply.
export async function sendEnquiry(_prev: EnquiryState, form: FormData): Promise<EnquiryState> {
  if (looksLikeBot(form, Date.now())) return { status: "sent" };

  const checked = checkEnquiry(form);
  if (!checked.ok) return { status: "invalid", errors: checked.errors, values: valuesOf(form) };

  const to = process.env.ENQUIRY_TO_EMAIL;
  if (!to) return { status: "failed", values: valuesOf(form) };

  const sent = await sendMail({ to, ...enquiryEmail(checked.enquiry, new Date()) });
  return sent ? { status: "sent" } : { status: "failed", values: valuesOf(form) };
}
