// Drawn copies of two real screens, in HTML and CSS (docs/DESIGN.md v2.1, "Screen mocks"):
// the phone's Today screen (apps/mobile/src/screens/HomeScreen.tsx) and the web Overview
// (app/(app)/overview/page.tsx). Labels and status words are the app's own; the sites and
// figures are sample data. Each mock is one image to a screen reader.

const SITES = [
  { name: "Baner Residency, Tower A", checkIn: "Checked in ✓", done: true, register: "Register 38 / 42", report: "Draft, saved on this phone", wait: true },
  { name: "Wakad Row Houses", checkIn: "Not checked in", done: false, register: "Register 0 / 25", report: "Not started", wait: false }
];

export function PhoneMock() {
  return (
    <div className="mk-phone" role="img" aria-label="The Alarsio phone app's Today screen, with sample sites: one checked in with 38 of 42 workers marked and a draft report saved on the phone">
      <div className="mk-phone-in" aria-hidden="true">
        <div className="mk-phone-bar"><span>9:41</span><span>No signal</span></div>
        <p className="mk-phone-title">Today</p>
        <p className="mk-phone-sub">Thursday 5 November</p>
        {SITES.map((s) => (
          <div key={s.name} className="mk-site">
            <p className="mk-site-name">{s.name}</p>
            <p className="mk-row"><span>Check in</span><b data-tone={s.done ? "ok" : undefined}>{s.checkIn}</b></p>
            <p className="mk-row"><span>Register</span><b>{s.register}</b></p>
            <p className="mk-row"><span>Report</span><b data-tone={s.wait ? "wait" : undefined}>{s.report}</b></p>
          </div>
        ))}
      </div>
    </div>
  );
}

const BOARD = [
  { site: "Baner Residency, Tower A", head: "38", day: "Needs approval", report: "Filed" },
  { site: "Wakad Row Houses", head: "24", day: "Approved", report: "Reviewed" },
  { site: "Hinjewadi Warehouse", head: "—", day: "Not started", report: "Not filed" }
];

export function DashboardMock() {
  return (
    <div className="mk-dash" role="img" aria-label="The Alarsio web Overview for one day, with sample figures: active sites, headcount reported, days to approve and low stock, and a table of today by site">
      <div className="mk-dash-in" aria-hidden="true">
        <div className="mk-dash-top">
          <span className="mk-dot" /><span className="mk-dot" /><span className="mk-dot" />
          <span className="mk-url">alarsio.com/overview</span>
        </div>
        <div className="mk-dash-body">
          <p className="mk-dash-title">Overview</p>
          <div className="mk-stats">
            <p><span>Active sites</span><b>3</b></p>
            <p><span>Headcount reported</span><b>62</b></p>
            <p data-alert=""><span>To approve</span><b>1</b></p>
            <p><span>Low stock</span><b>0</b></p>
          </div>
          <p className="mk-card-title">Today by site</p>
          <div className="mk-table">
            <p className="mk-th"><span>Site</span><span>Headcount</span><span>Day status</span><span>Report</span></p>
            {BOARD.map((r) => (
              <p key={r.site}>
                <span>{r.site}</span>
                <span>{r.head}</span>
                <span><i data-tone={r.day === "Approved" ? "ok" : r.day === "Needs approval" ? "action" : undefined}>{r.day}</i></span>
                <span>{r.report}</span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
