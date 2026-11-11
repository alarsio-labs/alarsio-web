// The Supabase Auth email templates, built from the same layout as the app's own emails.
// Supabase sends these itself, so the HTML is pasted into the dashboard
// (Authentication > Emails > Templates). The copies in supabase/templates/ are generated from
// this file and a test keeps them in step; see supabase/templates/README.md.
//
// Links use token_hash and /auth/confirm, the only form our confirm route accepts
// (docs/DEPLOY.md, "Confirm signup email"). The {{ ... }} parts are Supabase placeholders.
import { emailLayout } from "./layout";

const confirmUrl = (type: string, next: string) =>
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

/** The one-time code ({{ .Token }}) in large, spaced type. */
const codeBlock = (label: string) =>
  `<br><br><span style="font-size:14px;color:#67625C">${label}:</span><br><span style="display:inline-block;margin-top:8px;padding:12px 20px;background:#F7F2E6;border:1px solid #E4DFD3;border-radius:10px;font:700 28px/1 'Courier New',monospace;letter-spacing:6px;color:#171717">{{ .Token }}</span>`;

export const AUTH_TEMPLATES = {
  "confirm-signup": {
    subject: "Confirm your email for Alarsio",
    html: emailLayout({
      preheader: "One click to finish signing up for Alarsio.",
      heading: "Confirm your email",
      bodyHtml:
        "Thanks for signing up for Alarsio. Confirm that <strong>{{ .Email }}</strong> is your email address, and you can set up your company and first site.",
      // RedirectTo is the app's emailRedirectTo: /auth/confirm?next=<where they were going>.
      // It carries an invite (/invite/<token>) through sign-up; a fixed next would drop it,
      // and the invited supervisor would land on "Create organisation" instead of "Join".
      button: { label: "Confirm my email", href: "{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email" },
      footnote: "If you did not sign up for Alarsio, you can ignore this email. No account is made until the address is confirmed."
    })
  },
  "invite-user": {
    subject: "You're invited to Alarsio",
    html: emailLayout({
      preheader: "Your Alarsio account is ready. Set a password to start.",
      heading: "You're invited to Alarsio",
      bodyHtml:
        "An account has been made for <strong>{{ .Email }}</strong> on Alarsio. Accept the invite and choose a password to sign in.",
      button: { label: "Accept the invite", href: confirmUrl("invite", "/update-password") },
      footnote: "If you were not expecting this, you can ignore this email."
    })
  },
  "magic-link": {
    subject: "Your Alarsio sign-in link",
    html: emailLayout({
      preheader: "Sign in to Alarsio with one click.",
      heading: "Sign in to Alarsio",
      bodyHtml: `To sign in as <strong>{{ .Email }}</strong>, enter this code or use the button below.${codeBlock("Your code")}`,
      button: { label: "Sign in", href: confirmUrl("magiclink", "/dashboard") },
      footnote: "The link and code work once and expire soon. If you did not try to sign in, ignore this email."
    })
  },
  "change-email": {
    subject: "Confirm your new email for Alarsio",
    html: emailLayout({
      preheader: "Confirm the change of your Alarsio email address.",
      heading: "Confirm your new email",
      bodyHtml:
        "You asked to change your Alarsio email from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>. Click below to confirm.",
      button: { label: "Confirm new email", href: confirmUrl("email_change", "/dashboard") },
      footnote: "If you did not ask for this, ignore this email and your address stays the same."
    })
  },
  reauthentication: {
    subject: "Your Alarsio verification code",
    html: emailLayout({
      preheader: "Enter this code to confirm it's you.",
      heading: "Confirm it's you",
      bodyHtml: `To finish a sensitive change on your Alarsio account, enter this code.${codeBlock("Your code")}`,
      footnote: "The code works once and expires soon. If you did not ask for it, change your password."
    })
  },
  "reset-password": {
    subject: "Set a new Alarsio password",
    html: emailLayout({
      preheader: "Use this link to choose a new password.",
      heading: "Set a new password",
      bodyHtml:
        "We got a request to reset the password for <strong>{{ .Email }}</strong>. Click below to choose a new one.",
      button: { label: "Set a new password", href: confirmUrl("recovery", "/update-password") },
      footnote: "The link works once and expires in 1 hour. If you did not ask for this, ignore this email: your password stays the same."
    })
  }
} as const;

export type AuthTemplateName = keyof typeof AUTH_TEMPLATES;
