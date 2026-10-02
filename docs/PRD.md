# Product Requirements — Alarsio

Full document with every P0: `docs/reference/alarsio-prd.pdf`.
This file is the working summary.

## The promise

A supervisor can capture the essential site record **with no internet**, and an
owner can trust the resulting data enough to make a decision.

## Who it is for

Small Indian construction contractors running **2–20 active sites**. Civil
contractors, interior and renovation contractors, labour contractors.

## The problem

Sites run on paper registers, Excel, phone calls and WhatsApp. The data exists but
reaches the office late, sits in several places, and cannot be checked. The same
record is typed two or three times. At wage time, the office and the workers argue
about whose record is correct.

## Users

| User | What they need to do |
| :-- | :-- |
| **Owner** | See every site each day. Approve exceptions. Check wages. |
| **Project Manager** | Read daily reports. Fix exceptions. Chase missing data. |
| **Site Supervisor** | Check in. Mark attendance. File a report. Record materials. |
| **Accountant** | Turn approved attendance into a wage summary. Export it. |
| **Worker** | Not a login user in the MVP. |

## Six journeys

| | Journey | When |
| :-- | :-- | :-- |
| CUJ-1 | Set up company, sites, team, workers | First-time setup |
| CUJ-2 | Start the day — check in, mark attendance | Daily |
| CUJ-3 | End the day — daily report, materials | Daily |
| CUJ-4 | Prepare the wage summary | Weekly / monthly |
| CUJ-5 | Review sites, approve records, fix mistakes | Ongoing |
| CUJ-6 | Offboard people, archive sites, export data | Exit |

## Three value propositions

1. **Verified attendance** — the check-in proves the supervisor was on site, and
   that attendance feeds wages directly.
2. **A five-minute daily report** — mostly taps, works fully offline.
3. **Transparent wages** — approved attendance becomes a clear summary you export.

## Success, after the 30-day pilot

| Area | Target |
| :-- | :-- |
| Adoption | 80% of active sites send attendance + a report on 5+ days a week |
| Speed | Daily report: **median ≤ 5 min, 90th percentile ≤ 8 min**, measured in-app from opening the form to a successful submit, for a normal report — no photo, under 25 workers, one site, mid-range Android. From telemetry, never self-reported. |
| Retention | 60% of supervisors still active after two weeks |
| Business | 3 of 5 pilot customers continue on a paid plan |

**North-star metric:** active sites with verified attendance and a completed daily
report on the same working day.

## Scope

Every P0 is listed in `docs/FEATURES.md`, mapped to a module and an owner. That
file is the single source of truth for what is in.

## Out of scope — do not build

Approvals engine · Procurement and purchase orders · Projects and BOQ · Property
sales · Financial reporting and P&L · Worker self-service login · UPI wage
payments · WhatsApp or SMS alerts · Statutory registers · Accounting and GST
integrations · AI summaries · Continuous location tracking · Stock transfer
between sites · Gantt charts · Languages beyond English

Full reasoning per item is in §6.7 of the PRD PDF.
