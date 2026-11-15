# Alarsio: MVP access and feature documentation (15 Nov 2026)

## Access
| | |
|---|---|
| Live web app (owners, managers, accountants) | https://www.alarsio.com |
| Android app (site supervisors) | https://www.alarsio.com/download (APK v0.1.1) |
| Test login, owner | In 00_README (org "Sharma Constructions (Demo)") |
| Test login, supervisor (phone app) | In 00_README |
| Code repository | https://github.com/alarsio-labs/alarsio-web (public) |
| "Try this" script | Try-this.md (3 tasks, about 10 minutes) |

The test org holds sample data only: 2 Lucknow sites, 12 workers, 3–11 Nov attendance, reports, materials, one locked wage week. It is not a partner's data.

## 1. Summary
Alarsio is for small Indian building contractors who run 2–20 sites at once.
- The site supervisor records the day on an Android phone, even with no network: check-in at the site, labour attendance, a daily progress report and material in/out.
- The owner sees every site on the web. They approve attendance and get a weekly or monthly wage sheet that can be explained line by line.
- Today the same work runs on paper registers, WhatsApp photos and phone calls. That leads to wage disputes ("I was present that day"), cement and steel that cannot be accounted for, and owners driving between sites to find out what happened.
- A contractor pays for fewer wage disputes, less material loss and less time spent chasing supervisors.

## 2. Features
Status: **Live** works end to end with no manual steps. **Partial** has known gaps. **Manual** is done by hand by us. **Planned** is not built yet.

| Feature | What it does for the user | Used by | Status | Requested by |
|---|---|---|---|---|
| Organisation, roles and invites | Owner creates the company, invites a manager, supervisor or accountant by email; each sees only what the role allows | Manchitra Architects | Live (invite fixed 13 Nov, PR #227) | Team design |
| Sites with geofence | Add a site with its map location and radius; assign supervisors | Manchitra Architects | Live | Team design |
| Workers and wage rates | Add workers one by one or import an Excel/CSV list; set a daily rate with an effective date | Manchitra Architects | Live; Excel/CSV import Partial (not tested on the live site) | [feedback log] |
| Site check-in | Supervisor checks in on the phone; outside the site radius needs a reason | Manchitra Architects | Live | [feedback log] |
| Attendance | Mark present, absent, half day, leave and overtime; "mark all present"; works offline | Manchitra Architects | Live | [feedback log] |
| Attendance approval and corrections | Manager or owner approves a day; changes after approval go through a correction with a reason; nobody approves their own entries | Manchitra Architects | Live | [feedback log] |
| Daily progress report | Headcount, work done, blockers, photos; manager marks it reviewed or sends it back | Manchitra Architects | Live | [feedback log] |
| Materials and stock | Opening stock, receipts, usage, adjustments with a reason; low-stock flag per site | Manchitra Architects | Live | [feedback log] |
| Wage summary | Weekly or monthly wages from approved attendance only, with days, overtime and advances; accountant locks, only the owner reopens | Manchitra Architects | Live; Excel export Partial | [feedback log] |
| Offline sync | Every phone entry is saved on the phone first and sent when the network returns, with no duplicates; one bad record does not block the rest | Manchitra Architects | Live | [feedback log] |
| Audit trail and data export | Every change is logged; the owner downloads all company data as CSV files | Manchitra Architects | Live; the Export link is missing from the dashboard (#135) | Team design |
| Hindi app text | Phone screens in Hindi | None | Planned (#179) | [partner, date] |
| Phone OTP sign-in for supervisors | Sign in with a mobile number in place of email | None | Planned (#182) | [partner, date] |
| WhatsApp day slip | One image per site per day to share on WhatsApp | None | Planned (#183) | [partner, date] |

## 3. Architecture
- **Web:** Next.js (React, TypeScript) on Vercel, Mumbai region.
- **Phone:** Expo / React Native Android app. Entries go into a local SQLite outbox first, then sync.
- **Backend and database:** Supabase (PostgreSQL, Auth, file storage for report photos). There is no separate API server.
  - Every table has Row Level Security, so each user sees only their company and their sites.
  - Business rules live in the database (approval, wage lock, append-only ledgers).
- **Outside services:**
  - Resend sends invite and enquiry emails.
  - EAS builds the Android APK.
  - Google Analytics runs on public pages only, after cookie consent.
- **AI:** none inside the product.

```
Supervisor phone (Expo + SQLite outbox) ──sync when online──┐
                                                           ▼
Owner / manager browser ──► Next.js on Vercel ──► Supabase: Postgres + RLS, Auth, Storage
                                                           │
                                                  Resend (email)
```

## 4. Known limitations
- Design partners started recently: Manchitra Architects since 6 Nov 2026. We have fewer than the 3 partners asked for, with under 2 weeks of use each.
- The phone app is Android only; there is no iPhone build.
- Sign-in is by email and password, which supervisors find hard. Phone OTP is planned (#182).
- The phone screens are English only (Hindi planned, #179).
- The attendance table is cramped on 375 px phone browsers (#138).
- The Export link is missing from the dashboard; the page is reachable at /export (#135).
- There is no notification when a report or attendance waits for approval.
- The full smoke-test checklist (docs/DEPLOY.md) has not been run end to end; the reviewer Try-this tasks passed on 13 Nov.
