// The landing page's words, in one place (docs/DESIGN.md section 2). Every claim
// here is a feature in docs/FEATURES.md. No customer names, ratings, prices or
// numbers until the pilot produces real ones.

export const HERO = {
  top: "Site records with no signal",
  brand: "Alarsio",
  meta: ["Offline first", "2 to 20 sites", "Android and web", "For Indian contractors"]
};

export const MANIFESTO = "Every attendance, report and bag of cement, captured with no signal and trusted at wage time.";

export type Plate = "checkin" | "register" | "report" | "materials" | "overview" | "wages";

export const RAIL = {
  title: "One phone. Six records.",
  hint: "Keep scrolling →",
  cards: [
    { plate: "checkin", title: "Check in", type: "Site visit · geofence", role: "Supervisor" },
    { plate: "register", title: "Day register", type: "Everyone present in one tap", role: "Supervisor" },
    { plate: "report", title: "Daily report", type: "Headcount from attendance", role: "Supervisor" },
    { plate: "materials", title: "Materials", type: "Receipts · usage · stock", role: "Supervisor" },
    { plate: "overview", title: "Overview", type: "Every site, one day", role: "Owner" },
    { plate: "wages", title: "Wage summary", type: "Approved days only", role: "Accountant" }
  ] satisfies { plate: Plate; title: string; type: string; role: string }[]
};

// The day record prints itself in four phases. Each row and the status line have one
// value per phase; the cues light up to the current phase.
export const DAY_RECORD = {
  eyebrow: "The day record",
  title: "Printed only when the server has it.",
  body:
    "Every record is saved on the phone the moment it is typed, with its own id, and sent when a connection comes back. The phone says it is on the server only once the server has accepted it.",
  header: "Day record · Baner Residency, Tower A",
  name: "Wed 28 Oct",
  rows: [
    { label: "Record", values: ["7f3a-91c2", "7f3a-91c2", "7f3a-91c2", "7f3a-91c2"] },
    { label: "Server", values: ["pending", "on the server", "on the server", "on the server"] },
    { label: "Approved", values: ["—", "—", "—", "28 Oct"] }
  ],
  cues: ["Checked in, inside the geofence", "Everyone present, two exceptions", "Report filed", "Day approved"],
  status: ["Saved on this phone, waiting to send", "Sending…", "On the server", "Approved, ready for wages"],
  tear: "Approved days tear off to the wage summary"
};

export const WAGES = {
  title: "From approved days to wages you can explain.",
  chapters: [
    { n: "01", title: "Approve", body: "A project manager approves or rejects each attendance day. Nobody approves a day they recorded." },
    { n: "02", title: "Calculate", body: "Rate, payable days, overtime and adjustments, built from approved attendance only." },
    { n: "03", title: "Lock and export", body: "The accountant locks the period and exports CSV or Excel. Only the owner reopens it, with a reason." }
  ]
};

export const ROLES = {
  title: "Who does what",
  head: ["Role", "Records", "Sees"],
  rows: [
    ["Owner", "Sites, team and access", "Every site, wages, the audit log"],
    ["Project manager", "Approvals and send-backs", "Every site's reports and attendance"],
    ["Supervisor", "Check-in, attendance, report, materials", "Only the sites assigned to them"],
    ["Accountant", "Wage periods, locks, exports", "Approved attendance and wages"]
  ]
};

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
