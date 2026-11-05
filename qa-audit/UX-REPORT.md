# UX Report

**Audit:** Alarsio QA & Security Audit  
**Date:** 2026-11-02  
**Repository:** C:\Desktop\alarsio-web (main @ 482fb2c)  
**Methodology:** Static code review of page components and CSS

---

## Executive Summary

The application is **functional and purposeful** for its target users (small Indian construction contractors). Navigation is hub-and-spoke from the dashboard. Pages are clean and minimal. Key UX gaps are in error message clarity, lack of dashboard Export link, mobile table layout (known #138), and date format clarity for low-tech users.

---

## UX Findings

### UX-01 — Export link missing from dashboard (HIGH priority for pilot)

**Affected users:** All owners  
**Screen:** /dashboard  
**Issue:** The owner cannot find the Export page without knowing the URL. For a pilot where data trust is important, the ability to export data is reassurance. Users cannot discover this feature.  
**Recommendation:** Add Export link to the owner's dashboard card (BUG-02 fix covers this).

---

### UX-02 — ISO date format may confuse non-technical users

**Affected users:** Supervisors, owners (low computer literacy)  
**Screens:** /attendance, /reports, /wages, /overview  
**Issue:** Dates are displayed in ISO format (YYYY-MM-DD). Indian construction workers and owners are accustomed to DD/MM/YYYY format. The date picker input fields also use ISO format.  
**Example:** "2026-10-30" should show as "30 Oct 2026" or "30/10/2026"  
**Severity:** MEDIUM (usability for target audience)  
**Recommendation:** Add a `formatDate()` display utility that formats dates as "30 Oct 2026" for display (not for inputs, which need ISO format).

---

### UX-03 — Attendance table horizontal overflow at 375px (KNOWN #138)

**Affected users:** Owners and managers reviewing attendance on phone  
**Screen:** /attendance/[id]  
**Issue:** Entry table overflows at 375px viewport width. Key use case: manager reviewing attendance on a mobile phone.  
**Severity:** MEDIUM  
**Recommendation:** Wrap table in `overflow-x-auto` or use a card-per-row layout at mobile breakpoints.

---

### UX-04 — Error messages use technical codes

**Affected users:** All  
**Screens:** All form submission pages  
**Issue:** Errors like `worker_invalid`, `org_failed`, `site_not_allowed`, `wage_reason` are shown to users. Even after `messageFor()` mapping, some edge-case errors show the raw code.  
**Severity:** MEDIUM  
**Evidence:** BUG-04 (pay-type lock), BUG-06 (addWorker empty code)  
**Recommendation:** Audit all error code mappings in `lib/messages.ts`. Ensure all DB-returned error codes have human-readable messages.

---

### UX-05 — No confirmation dialog on supervisor removal from site

**Affected users:** Owners, project managers  
**Screen:** /sites/[id] — supervisor assignment  
**Issue:** Removing a supervisor from a site appears to execute immediately. For a potentially consequential action (supervisor loses access), a confirmation dialog or undo option would reduce accidental removals.  
**Severity:** LOW (data is not deleted, assignment is closed)  
**Recommendation:** Add a confirm dialog before removing a supervisor.

---

### UX-06 — Empty state on /wages shows "No periods yet. Start one below."

**Affected users:** Owners, accountants  
**Screen:** /wages  
**Assessment:** GOOD — clear empty state with call to action. No issue.

---

### UX-07 — No loading indicator during form submissions

**Affected users:** All  
**Issue:** Server actions take a round-trip to the server. During this time, the button is not disabled and there is no spinner. Users may click multiple times.  
**Severity:** LOW (Server Actions in Next.js have form submission deduplication, but visible feedback is good UX)  
**Recommendation:** Add `disabled` and a loading state to submit buttons using `useFormStatus()`.

---

### UX-08 — Capped data notice is clear and appropriate

**Affected users:** Owners, managers  
**Screens:** /attendance, /overview  
**Assessment:** GOOD — when query limits are hit, a note explains which data is truncated and how to see more (narrow the date range). Example: "Showing only the newest 1000 days; older ones are left out."

---

### UX-09 — Dashboard first-time experience is good

**Affected users:** New owners  
**Screen:** /dashboard (no org yet)  
**Assessment:** GOOD — shows "Create your organisation" with a clear 3-step wizard. Instruction: "You will be its owner. Joining someone else's? Open the invite link they sent you."

---

### UX-10 — Navigation breadcrumb is consistent

**Affected users:** All  
**Assessment:** GOOD — every sub-page has "← Dashboard" as the first link. Consistent and clear.

---

## Responsiveness Assessment

Tested at these breakpoints via code review (live test pending):

| Breakpoint | Assessment | Notes |
|---|---|---|
| 1440px | GOOD | Containers max-w-3xl, centered |
| 1280px | GOOD | Same as 1440px |
| 768px | GOOD | Grid collapses to 2 cols |
| 375px | PARTIAL | Known issue #138 on attendance table |
| 360px | UNKNOWN | Needs live test |

---

## Accessibility Assessment (Static)

| Check | Status | Notes |
|---|---|---|
| Native HTML elements for interactive controls | PASS | No custom button/link components |
| Label association in forms | PASS | `<Field label>` wrapper + `<label>` elements |
| `required` attributes | PASS | Used on required inputs |
| `aria-label` on icon-only elements | PARTIAL | Wordmark has aria-label; check icon buttons |
| Focus visible on interactive elements | UNKNOWN | Tailwind default focus ring — needs live test |
| Color contrast | UNKNOWN | Needs live test (neutral-500 on white may be borderline) |
| Table headers with `scope` | PARTIAL | `<th>` used but `scope="col"` not confirmed |
| Screen reader order matches visual order | LIKELY PASS | Server-rendered, semantic HTML |
| Keyboard navigation through filter forms | LIKELY PASS | Native select and input elements |
| Skip navigation link | NOT FOUND | Not observed in code — accessibility gap |

---

## Usability for Low-Tech Users

### Construction Business Owner (primary user)
- **Dashboard:** Clear org card with role-appropriate links — GOOD
- **Overview page:** Single-day view of all sites — GOOD concept; label clarity is acceptable
- **Date format:** ISO dates may confuse — UX-02
- **Error messages:** Technical codes — UX-04
- **Export discovery:** Hidden — UX-01

### Supervisor (secondary user, limited computer experience)
- **Reports list:** Filtered by their sites — GOOD
- **Navigation:** Only sees Daily Reports on dashboard — clear and focused — GOOD
- **No attendance entry on web** (mobile-only for supervisors) — correct by design

### Accountant
- **Workers + Wages visible on dashboard** — correct
- **Wage period creation:** Simple form (period type + start date) — GOOD
- **CSV/Excel export:** Functional — GOOD

---

## Recommendations (Priority Order)

1. **[PILOT BLOCKER]** Add Export link to owner's dashboard card (#135 fix)
2. **[HIGH]** Fix attendance table at 375px (#138 fix)
3. **[MEDIUM]** Display dates in DD MMM YYYY format for Indian users
4. **[MEDIUM]** Audit and complete all error code-to-message mappings
5. **[LOW]** Add confirm dialog on supervisor removal
6. **[LOW]** Add loading state to form submit buttons
7. **[LOW]** Add skip navigation link for keyboard/screen reader users
8. **[LOW]** Verify color contrast ratios with live browser test

