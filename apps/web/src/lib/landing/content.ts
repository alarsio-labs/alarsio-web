// The home page's words, in one place (docs/DESIGN.md v2.1, section 2). Every claim here is
// a feature in docs/FEATURES.md. No customer names, ratings, price figures or real-looking
// customer numbers until the pilot produces real ones. "Free during the pilot" is allowed.
// Figures inside the screen mocks and the heatmap are sample data and are labelled so.

export const HERO = {
  eyebrow: "For contractors running 2 to 20 sites",
  title: "Attendance, reports and materials. Recorded on site, even with no signal.",
  lede:
    "Your supervisors record the day on an Android phone, signal or not. You get one record you can trust, from every site, and wages built only from approved days.",
  note: "Free during the pilot · No card needed",
  // Also shown on the sign-in pages' dark panel.
  meta: ["Offline first", "2 to 20 sites", "Android and web", "For Indian contractors"]
};

// The product video under the hero. Silent, so everything it says is on screen.
export const VIDEO = {
  eyebrow: "See it in 30 seconds",
  title: "One site day, from check-in to wages.",
  src: "/video/alarsio-ad.mp4",
  poster: "/video/alarsio-ad-poster.jpg",
  label: "A 30-second silent video: a supervisor's check-in, the owner's overview, offline daily reports and wage summaries in Alarsio.",
  caption: "Silent · 30 seconds · Screens from the live app"
} as const;

export const MARQUEE = [
  "Works with no signal",
  "Wages from approved days only",
  "Built for 2 to 20 sites",
  "Android phone and web",
  "Download all your data any time"
];

export const PROBLEMS = {
  eyebrow: "The problem",
  title: "By month end, the site's day is lost.",
  items: [
    { title: "Attendance lives in notebooks and WhatsApp", body: "Each site keeps it its own way. Someone in the office types it up again, from photos of pages." },
    { title: "Pay day turns into a fight over days", body: "Nobody can show which days a worker was present, who checked, or why the total is what it is." },
    { title: "Materials arrive with no record", body: "Cement and steel come in, get used, and the stock on paper never matches the stock on site." }
  ]
};

export const FEATURES = {
  eyebrow: "One phone, six records",
  title: "Everything the site records, in one app.",
  items: [
    { title: "Check in", body: "The supervisor checks in at the site. The phone notes whether they were inside the site boundary.", role: "Supervisor · phone" },
    { title: "Day register", body: "Mark everyone present in one tap, then change only the exceptions.", role: "Supervisor · phone" },
    { title: "Daily report", body: "Work done, blockers, safety and photos. Headcount comes from the register.", role: "Supervisor · phone" },
    { title: "Materials", body: "Receipts, usage and stock for each site, with a warning when stock runs low.", role: "Supervisor · phone" },
    { title: "Overview", body: "Every site for one day: who is present, which reports are in, what needs you.", role: "Owner · web" },
    { title: "Wage summary", body: "Rate, payable days, overtime and adjustments, built from approved attendance only.", role: "Accountant · web" }
  ]
};

export type RoleCard = { role: string; where: string; does: string; sees: string; cta: { label: string; href: string } };

/** The anchor id of a role's card on the home page ("Project manager" becomes "role-project-manager"). */
export function roleId(role: string): string {
  return `role-${role.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

export const ROLES = {
  eyebrow: "Four roles",
  title: "Each person sees only their part.",
  cards: [
    { role: "Owner", where: "Web", does: "Creates the company, its sites and its team.", sees: "Every site, every day, and wages. Downloads all the company's data.", cta: { label: "Book a demo", href: "/demo" } },
    { role: "Project manager", where: "Phone and web", does: "Approves or sends back each attendance day and report.", sees: "Every site's reports and attendance.", cta: { label: "Get the app", href: "/download" } },
    { role: "Supervisor", where: "Phone", does: "Checks in, marks the register, files the report, logs materials.", sees: "Only the sites assigned to them.", cta: { label: "Get the app", href: "/download" } },
    { role: "Accountant", where: "Web", does: "Runs wage periods, locks them and exports CSV or Excel.", sees: "Approved attendance and wages.", cta: { label: "Sign in", href: "/sign-in" } }
  ] satisfies RoleCard[]
};

export const STEPS = {
  eyebrow: "How it works",
  title: "From the first site to the first wage sheet.",
  items: [
    { title: "Create your company", body: "The owner signs up, names the company and adds the first site." },
    { title: "Invite your team", body: "Send each person an invite link. Their role decides what they see." },
    { title: "Add your workers", body: "Type them in, or import your list from a CSV file saved from Excel." },
    { title: "Record the day on site", body: "Check in, register, report and materials. No signal needed; the phone sends it later." },
    { title: "Approve, lock and pay", body: "Approved days become wages. The accountant locks the period; only the owner can reopen it, with a reason." }
  ]
};

// The day record slip: one value per phase. The home page shows the last phase; the status
// words are the phone's own, in the order the phone shows them.
export const DAY_RECORD = {
  eyebrow: "Honest sync",
  title: "We never say sent until it's sent.",
  body:
    "Every record is saved on the phone the moment it is typed, and sent when a connection comes back. The phone says \"On the server\" only once the server has accepted it.",
  header: "Day record · Baner Residency, Tower A",
  name: "Wed 28 Oct",
  rows: [
    { label: "Record", values: ["7f3a-91c2", "7f3a-91c2", "7f3a-91c2", "7f3a-91c2"] },
    { label: "Server", values: ["pending", "on the server", "on the server", "on the server"] },
    { label: "Approved", values: ["—", "—", "—", "28 Oct"] }
  ],
  cues: ["Checked in, inside the site boundary", "Everyone present, two exceptions", "Report filed", "Day approved"],
  status: ["Saved on this phone, waiting to send", "Sending…", "On the server", "Approved, ready for wages"]
};

export const HEATMAP = {
  eyebrow: "Every site, every day",
  title: "See a site's whole season at a glance.",
  body: "Each square is one day at one site: darker means more of the roster was present. Tap a day to see it.",
  caption: "Sample site, sample data"
};

export const TRUST = {
  eyebrow: "Your data",
  title: "Records you can stand behind.",
  items: [
    { title: "Only your company sees it", body: "Every rule is enforced in the database, not just hidden in the app." },
    { title: "Corrections never overwrite", body: "Stock and wage records only grow: a correction is a new entry beside the old one." },
    { title: "Take it with you", body: "The owner can download all of the company's data as CSV files at any time." },
    { title: "No ads, no trackers", body: "No third-party scripts on this site. Your site records are not for sale." }
  ]
};

export const FAQ: { q: string; a: string }[] = [
  { q: "Does it really work without internet?", a: "Yes. Check-in, attendance, the daily report and materials are saved on the phone first and sent when it finds a connection. The phone says \"On the server\" only once the server has the record." },
  { q: "Which phones does it run on?", a: "Android phones, for the pilot. The office uses the web app in any modern browser." },
  { q: "Who sees what?", a: "There are four roles: owner, project manager, supervisor and accountant. A supervisor sees only the sites assigned to them, and every rule is enforced in the database, not just hidden in the app." },
  { q: "Can a supervisor mark attendance from home?", a: "Check-in records whether the phone was inside the site boundary, and every attendance day needs a project manager's approval before it counts for wages. Nobody approves a day they recorded." },
  { q: "Can I bring my worker list from Excel?", a: "Yes. Save the sheet as a CSV file and import it on the Workers page. A template file shows the columns." },
  { q: "What does it cost?", a: "It is free during the pilot, and no card is needed to start. You can download all of your company's data at any time." },
  { q: "Is it in Hindi?", a: "The pilot is in English. Tell us which language your supervisors need: it decides what we add next." },
  { q: "Can I take my data out?", a: "Yes. The owner can download all of the company's data as CSV files at any time, and wage summaries export to CSV and Excel." }
];

export const CTA = {
  title: "Run 2 to 20 sites? Book a demo.",
  body: "Tell us about your sites. We'll call or WhatsApp you, show you Alarsio and set up your first site with you.",
  note: "Free during the pilot. No card needed.",
  primary: { label: "Book a demo", href: "/demo" },
  pilot: { label: "Start free pilot", href: "/sign-up" },
  secondary: { label: "Sign in", href: "/sign-in" },
  download: { label: "Download Android app", href: "/download" }
};
