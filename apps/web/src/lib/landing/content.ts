// The landing page's words, in one place (docs/DESIGN.md section 4). Every claim
// here is a feature in docs/FEATURES.md. No customer names, ratings or numbers
// until the pilot produces real ones.

export type SectionId = "how-it-works" | "offline" | "office" | "faq";

export const NAV: { label: string; href: `#${SectionId}` }[] = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Offline", href: "#offline" },
  { label: "Wages", href: "#office" },
  { label: "FAQ", href: "#faq" }
];

export const HERO = {
  eyebrow: "Site records for Indian contractors",
  headline: ["Your site record.", "Even with no signal.", "Trusted at wage time."],
  lead:
    "A supervisor captures attendance, the daily report and materials on the phone, with or without internet. The owner sees every site and pays from approved attendance.",
  ticks: [
    "Check-in that proves the supervisor was on site",
    "Attendance for the whole crew in one tap",
    "A daily report that takes minutes, not an evening",
    "Wages built from approved attendance only"
  ]
};

export const PROBLEMS: { title: string; body: string }[] = [
  { title: "Paper registers", body: "Attendance sits in a notebook on site and reaches the office days later, if at all." },
  { title: "WhatsApp and Excel", body: "Reports, photos and stock counts are scattered across chats and sheets nobody can check." },
  { title: "Arguments at wage time", body: "The same record is typed two or three times, and the office and the crew disagree on whose is right." }
];

export type Tab = {
  id: "check-in" | "attendance" | "report" | "materials";
  label: string;
  eyebrow: string;
  title: string;
  body: string;
};

export const DAY_TABS: Tab[] = [
  {
    id: "check-in",
    label: "Check in",
    eyebrow: "Start of the day",
    title: "Check in at the site, not from home",
    body: "Location is read once, on the tap, and checked against the site's geofence. Outside it, the supervisor has to give a reason, and the office sees it."
  },
  {
    id: "attendance",
    label: "Mark attendance",
    eyebrow: "Day register",
    title: "Everyone present in one tap, then the exceptions",
    body: "Mark the whole rostered crew present, then change only who is on half day, on leave, absent or doing overtime, with a note per worker."
  },
  {
    id: "report",
    label: "Daily report",
    eyebrow: "End of the day",
    title: "The whole day, filed from the phone",
    body: "Headcount is filled in from attendance. Add work done, blockers, a safety flag and tomorrow's plan. Photos are optional and never hold up the report."
  },
  {
    id: "materials",
    label: "Materials",
    eyebrow: "Stock on site",
    title: "Receipts and usage, recorded where they happen",
    body: "Record opening stock, receipts, usage and adjustments with no signal. Low or negative stock is flagged, and an adjustment always needs a reason."
  }
];

export const RECORD_STATES: { word: string; tone: "wait" | "ok" | "warn"; detail: string }[] = [
  { word: "Saved on this phone, waiting to send", tone: "wait", detail: "Saved the moment it is typed, with its own id, even in airplane mode." },
  { word: "Sending…", tone: "wait", detail: "Sent when the phone finds a connection. A record sent twice is stored once." },
  { word: "On the server", tone: "ok", detail: "Shown only after the server has accepted that record. Never before." },
  { word: "Needs attention", tone: "warn", detail: "If a manager already approved the day, the change is held and shown, not lost." }
];

export const OFFICE_CARDS: { title: string; body: string }[] = [
  { title: "Every site on one page", body: "The owner's overview shows each site for the day: report filed or not, attendance state, geofence flags, pending corrections and low stock." },
  { title: "Approve the day", body: "A project manager approves or rejects each attendance day and each correction. Nobody approves a day they recorded themselves." },
  { title: "Wages you can explain", body: "Approved attendance becomes a weekly or monthly summary with rate, days, overtime and adjustments. Export it to CSV or Excel." },
  { title: "Your data stays yours", body: "Every change is kept in an audit log. The owner can download all of the company's data at any time." }
];

export const ROLES: { role: string; does: string }[] = [
  { role: "Owner", does: "Sees every site each day, checks wages, and controls who has access." },
  { role: "Project manager", does: "Reads reports, approves attendance and sends back what needs fixing." },
  { role: "Supervisor", does: "Checks in, marks attendance, files the report and records materials, only for assigned sites." },
  { role: "Accountant", does: "Turns approved attendance into the wage summary, locks it and exports it." }
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Does it really work without internet?", a: "Yes. Check-in, attendance, the daily report and materials are saved on the phone first and sent when it finds a connection. The phone says \"On the server\" only once the server has the record." },
  { q: "Which phones does it run on?", a: "Android phones, for the pilot. The office uses the web app in any modern browser." },
  { q: "Who sees what?", a: "There are four roles: owner, project manager, supervisor and accountant. A supervisor sees only the sites assigned to them, and every rule is enforced in the database, not just hidden in the app." },
  { q: "Can I take my data out?", a: "Yes. The owner can download all of the company's data as CSV files at any time, and wage summaries export to CSV and Excel." }
];

export const CTA = {
  title: "Run 2 to 20 sites? Join the pilot.",
  body: "Create your company account, add your sites and team, and start with one site this week.",
  primary: { label: "Join the pilot", href: "/sign-up" },
  secondary: { label: "Sign in", href: "/sign-in" }
};
