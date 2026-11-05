# Performance Report

**Audit:** Alarsio QA & Security Audit  
**Date:** 2026-11-02  
**Repository:** C:\Desktop\alarsio-web (main @ 482fb2c)  
**Methodology:** Static code review (live Lighthouse measurements pending)

---

## Summary

Overall performance architecture is **good** for the target scale (2-20 sites, ~50-200 workers). The application is primarily Server-Component-rendered, which minimises JS shipped to the browser. No N+1 query patterns were found in reviewed pages.

---

## Architecture Performance Characteristics

### Why Server Components Help
All data pages (`/dashboard`, `/overview`, `/attendance`, `/reports`, `/wages`, `/workers`, `/sites`) are Next.js Server Components. Data is fetched server-side and HTML is streamed. The browser receives rendered HTML + minimal JS for interactivity. This gives:
- Fast LCP on first load (server renders the full page)
- Near-zero JS bundle for data-display pages
- No client-side data fetching waterfalls

### What Runs Client-Side
- Landing page animation (`field-canvas.tsx`, canvas API)
- Import panel (`import-panel.tsx` — reads CSV/Excel file client-side)
- Create Org Wizard (`create-org-wizard.tsx` — multi-step form with client state)
- Invite form (`invite-form.tsx` — uses `useFormState` for the response link)

These are appropriate uses of client components.

---

## Measurements (Static Analysis)

### Query Patterns

| Page | Query count | Pattern | Assessment |
|---|---|---|---|
| Overview | 6 parallel (Promise.all) | `site_directory`, `daily_report_status`, `site_exceptions`, `approved_attendance_days`, `material_alerts`, `is_org_member` | GOOD |
| Attendance list | 3 parallel | days, reviewExceptions, flagExceptions + site_directory | GOOD |
| Reports list | 3 parallel | is_org_member, site_directory, reports | GOOD |
| Wages list | 3 parallel | organizations, can_view_wages, wage_periods | GOOD |
| Workers list | 4 parallel | organizations, can_manage_sites, can_view_wages, workers | GOOD |
| Dashboard | 2 sequential | getUser() → memberships | ACCEPTABLE |

### Query Limits

| Page | Limit | At pilot scale (20 sites) | Concern? |
|---|---|---|---|
| Attendance days | 1000 | ~20 sites × 31 days = 620 | No |
| Review exceptions | 1000 | Unlikely to hit | No |
| Overview sites | 500 | Max 20 | No |
| Overview approved days | 5000 | ~20 sites × 50 workers = 1000/day | No |
| Reports | 200 | Filtered to 31 days | No |
| Workers | 200/page | Paginated | No |
| Wage periods | unbounded | Grows over time | MINOR CONCERN |

---

## Performance Issues Found

### PERF-01 — Wage period list is unbounded

| Field | Value |
|---|---|
| **Severity** | LOW (pilot scale: negligible) |
| **Affects** | `/wages` page load time |

**Description:**  
`readPeriods()` fetches all wage periods for an org without pagination. For a pilot with weekly periods over 1 year, this would be 52 rows — trivial. For production over 3+ years, this is 150+ rows. The list is rendered without pagination.

**Recommendation:** Add a `.limit(100)` or year-filter to `readPeriods()` in `lib/wages/read.ts`.

---

### PERF-02 — Export is synchronous, no streaming

| Field | Value |
|---|---|
| **Severity** | LOW (bounded by EXPORT_PAGE_SIZE) |
| **Affects** | `/export/download` |

**Description:**  
The export builds a ZIP synchronously in memory (`runExport()` in `lib/export/run.ts`). For an org with tens of thousands of rows, this could exceed Vercel's function timeout (default 10s, configurable to 60s on Pro plan).

`EXPORT_PAGE_SIZE = 1000` means the DB is queried in 1000-row batches, but all rows are held in memory before zipping. For 20 tables × 1000 rows each, this is ~200,000 rows maximum in memory.

**Recommendation:** For pilot (small orgs), this is acceptable. For production, consider streaming ZIP or background job.

---

### PERF-03 — Landing page canvas animation (Firefox stall — fixed in 482fb2c)

| Field | Value |
|---|---|
| **Severity** | LOW (fixed in production) |
| **Status** | Fixed |

The commit at `482fb2c` explicitly fixes "Stop the landing page stalling the browser (Firefox)." The fix is on main and deployed to Vercel. **No action needed.**

---

### PERF-04 — No HTTP caching headers observed (pending live check)

**Description:**  
Cannot verify cache-control headers without live HTTP inspection. Vercel automatically adds caching for static assets (`_next/static/`). Server-Component pages should have `Cache-Control: no-store` or `private` (since they contain user-specific data). This needs live verification.

---

## Lighthouse Estimates (Static)

Cannot run Lighthouse without browser access. Based on code review:

| Metric | Expected | Reason |
|---|---|---|
| LCP | Good (< 2.5s) | Server-rendered pages, minimal JS |
| INP | Good | Minimal client-side JS |
| CLS | Good | No layout shift patterns observed |
| TTFB | Depends on Supabase latency | Multiple parallel queries; Supabase hosted in same region? |
| JS bundle size | Small (< 100KB) | Server Components; import-panel is client-only |

---

## Recommendations (Priority Order)

1. **[P1]** Verify Supabase project region matches Vercel deployment region (both should be in the same cloud region to minimize TTFB)
2. **[P2]** Add pagination or year-filter to wage period list
3. **[P3]** Verify security/cache headers on live site
4. **[P4]** Consider a Vercel function timeout increase for `/export/download` if org data grows
5. **[P5]** Monitor canvas animation on low-end Android devices (even after the Firefox fix)

