import type { ReactNode } from "react";

// The pictures beside the sign-in card on wide screens, and the small headers above it on a
// phone (docs/DESIGN.md section 2b, v3). Drawn in HTML and CSS from the phone app's own
// screens; every name and number is sample data. All of them are hidden from screen readers.

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="sx-phone">
      <div className="sx-phone-sc">{children}</div>
    </div>
  );
}

function PhoneTop({ title, line, chip }: { title: string; line: string; chip?: ReactNode }) {
  return (
    <div className="sx-ptop">
      <p className="sx-plogo">
        Alar<span>sio</span>
      </p>
      <p className="sx-ptitle">{title}</p>
      <p className="sx-pline">{line}</p>
      {chip}
    </div>
  );
}

function Float({ className, dot, title, small }: { className: string; dot: string; title: string; small: string }) {
  return (
    <div className={`sx-float ${className}`}>
      <i style={{ background: dot }} />
      <span>
        {title}
        <small>{small}</small>
      </span>
    </div>
  );
}

/** Sign in: the phone's Today screen, as a supervisor sees it on site. */
export function TodayVisual() {
  return (
    <div className="sx-stage">
      <Float className="sx-float-1" dot="#D98A2B" title="Saved on this phone" small="12 records · sends later" />
      <Phone>
        <PhoneTop title="Today" line="Thursday 7 November" chip={<span className="sx-pchip">● All sent</span>} />
        <div className="sx-psite">
          <b>Baner Residency, Tower A</b>
          <p><span>Check in</span><span className="sx-ok">Checked in ✓</span></p>
          <p><span>Register</span><span>38 / 42</span></p>
          <p><span>Report</span><span className="sx-wait">Draft on phone</span></p>
        </div>
        <div className="sx-psite">
          <b>Wakad Row Houses</b>
          <p><span>Check in</span><span>Not yet</span></p>
          <p><span>Register</span><span>0 / 25</span></p>
        </div>
        <div className="sx-pbtns"><span>Check in</span><span>Register</span></div>
      </Phone>
      <Float className="sx-float-2" dot="#2E9E5B" title="All sent" small="Baner Residency · 2 min ago" />
    </div>
  );
}

export const SIGN_UP_STEPS = [
  { title: "Create your account", body: "Your name, email and a password." },
  { title: "Confirm your email", body: "Tap the link we send you." },
  { title: "Name your company", body: "Then add your first site." }
] as const;

/** Create account: the three steps to a working pilot, with the first one lit. */
export function PathVisual() {
  return (
    <div className="sx-stage sx-path">
      <p className="sx-path-kicker">Free pilot · about 5 minutes</p>
      <ol>
        {SIGN_UP_STEPS.map((s, i) => (
          <li key={s.title} className={i === 0 ? "sx-path-now" : undefined}>
            <span className="sx-path-n">{i + 1}</span>
            <span>
              <b>{s.title}</b>
              <small>{s.body}</small>
            </span>
          </li>
        ))}
      </ol>
      <div className="sx-path-card">
        <span className="sx-path-ic">↓</span>
        <span>
          <b>Your data stays yours</b>
          <small>An owner can export all of it, any time.</small>
        </span>
      </div>
    </div>
  );
}

/** Check email: a phone with the confirmation email arriving. */
export function InboxVisual({ reset = false }: { reset?: boolean }) {
  return (
    <div className="sx-stage">
      <Phone>
        <PhoneTop title="Inbox" line="1 new email" />
        <div className="sx-mail sx-mail-new">
          <span className="sx-mail-av">A</span>
          <span>
            <b>Alarsio</b>
            <em>{reset ? "Set a new password" : "Confirm your email"}</em>
            <small>{reset ? "Tap the link to choose a new password…" : "Tap the link to finish creating…"}</small>
          </span>
        </div>
        <div className="sx-mail">
          <span className="sx-mail-av sx-mail-av-2">S</span>
          <span>
            <b>Site supplier</b>
            <em>Cement delivery, Friday</em>
          </span>
        </div>
      </Phone>
      <div className="sx-float sx-float-1 sx-float-mail">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></svg>
        <span>
          Email sent
          <small>Usually arrives in a minute</small>
        </span>
      </div>
    </div>
  );
}

/** Link expired: a used ticket, torn, with the way to a new one. */
export function ExpiredVisual() {
  return (
    <div className="sx-stage sx-ticket-stage">
      <div className="sx-ticket sx-ticket-old">
        <span className="sx-ticket-label">Email link</span>
        <b>Used or expired</b>
        <small>Each link works once, for a short time.</small>
      </div>
      <div className="sx-ticket sx-ticket-new">
        <span className="sx-ticket-label">New link</span>
        <b>Ready in a minute</b>
        <small>Enter your email and we send a fresh one.</small>
      </div>
    </div>
  );
}

/** Forgot or set a password: a key and a lock, on the same stage. */
export function KeyVisual({ lock = false }: { lock?: boolean }) {
  return (
    <div className="sx-stage sx-key-stage">
      <div className="sx-key-disc">
        {lock ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><path d="M12 14.5v2.5" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-4 0 2 2" /></svg>
        )}
      </div>
      <Float
        className="sx-float-2"
        dot="#2E9E5B"
        title={lock ? "Your records are safe" : "Nothing is lost"}
        small={lock ? "A new password changes nothing else" : "Your sites and records stay as they are"}
      />
    </div>
  );
}

/** Invite: the invitation as a card, with the four roles. */
export function InviteVisual() {
  return (
    <div className="sx-stage sx-invite-stage">
      <div className="sx-invite">
        <span className="sx-ticket-label">Invitation</span>
        <b>Join your team on Alarsio</b>
        <small>Your owner chose your role. You see only what that role needs.</small>
        <ul>
          <li>Supervisor <span>Phone</span></li>
          <li>Project manager <span>Phone and web</span></li>
          <li>Accountant <span>Web</span></li>
        </ul>
      </div>
    </div>
  );
}

/* Small headers for phones, one per page. */

export function StatusChip() {
  return (
    <span className="sx-mchip">
      <i />
      Works with no signal
    </span>
  );
}

export function StepStrip({ at }: { at: 1 | 2 | 3 }) {
  return (
    <ol className="sx-steps">
      {SIGN_UP_STEPS.map((s, i) => (
        <li key={s.title} data-state={i + 1 < at ? "done" : i + 1 === at ? "now" : "todo"}>
          <span>{i + 1}</span>
          {s.title.replace("Create your account", "Account").replace("Confirm your email", "Confirm").replace("Name your company", "Company")}
        </li>
      ))}
    </ol>
  );
}

export function IconBadge({ kind }: { kind: "mail" | "alert" | "key" | "lock" | "invite" }) {
  const paths: Record<typeof kind, ReactNode> = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 2 2m-4 0 2 2" /></>,
    lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
    invite: <><path d="M4 9.5 12 4l8 5.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="m4 9.5 8 5.5 8-5.5" /></>
  };
  return (
    <span className={`sx-badge sx-badge-${kind}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {paths[kind]}
      </svg>
    </span>
  );
}
