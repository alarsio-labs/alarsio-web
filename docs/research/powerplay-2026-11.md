# Powerplay research and Alarsio website plan (8 Nov 2026)

## Context
You asked for a deep look at Powerplay (getpowerplay.in), a comparison with alarsio.com and our product, and a plan to improve.
Your answers (8 Nov 2026):
- **Until 15 Nov: MVP only.** No website work, no new features. All nine MVP modules must work first.
- **After 15 Nov:** improve the website to Powerplay's level of polish. This goes on the roadmap.
- **Sign-up model:** hybrid. "Book a demo" becomes the main CTA, and "Start free pilot" stays.
- **Leads:** enquiry form, WhatsApp and phone. Every enquiry goes straight to you. You reply within 5 hours at most.
- **Pricing:** decided, but kept private. It is shared on the call.

The research was read-only. This file is the report and the plan; no product code changed.

---

## 1. Powerplay: what they actually are

**Company.** Coffer Internet Services, Bengaluru, founded 2019. They raised about $12M from Accel and Sequoia Surge (2021–22). They report a $10M run rate, 15+ staff on the team page, and an AI and credit push in 2026.

**Two websites.**
- getpowerplay.in is the old WordPress/Divi site: homepage, role pages and content.
- getpowerplay.ai is the new Framer site, "AI Workforce". All `/features/*` pages redirect there.

**Funnel.** Sales-led.
- "Request A Demo" is on every page, tagged with UTM codes that record where it was clicked.
- Second CTA: "Download Now", which goes to the Play Store. There is no web sign-up.
- No public prices and no trial. Directories list about ₹72k–₹1.2L per year.

**Demo form.** 7 required fields: name, mobile, email, company, company type, turnover band and designation.
- No calendar, no WhatsApp, and no reply-time promise.
- The mobile field is `type=number`, and the validation message has a typo.

**Trust.**
- Big counters, but they contradict each other: 20k vs 40k businesses, 85k vs 99k vs 700k projects, and a 4.5 vs 4.9 rating. The real store rating is 4.7.
- 5 logos, 23 text testimonials, 8 case studies, a press page with 11 items, and a QR code to the app on every page.

**Content and SEO.**
- About 22 blog posts, 17 gated templates and 5 free calculators.
- 13 use-case pages, 5 persona pages and 4 comparison pages.
- A footer with 11 link groups.
- Hindi only on one Facebook-ad landing page.

**Design (measured in the browser).**
- Brand blue header, crimson CTA `#B31733` with 6px radius.
- Poppins for body text, Montserrat for headings at 18–25px. The homepage has no H1.
- Desktop page height is 32,800px, very long.

**Quality, measured.**
- The homepage loads 2.8 MB over 163 requests. DOMContentLoaded at 5.5s, load at 9.3s.
- 12 third-party scripts: Clarity, Segment, GTM, LinkedIn, Warmly, Factors, OptinMonster, Freshchat and others.
- The viewport has `user-scalable=0`, which blocks pinch-zoom (an accessibility failure).
- Mobile hero: the headline is hard to read over the photo, and there is no CTA in the first screen. 73 tap targets are under 32px.
- Sitemap clutter, copy errors (one page says "Procore's solutions"), and internal names in page titles.

**Product.** These are claims from marketing, not verified:
- Projects: WBS, Gantt and DPR, with the DPR sent on WhatsApp.
- Labour: attendance, overtime and wages from attendance, with advances.
- Materials: indent → RFQ → PO → GRN, 3-way match, stock, transfers.
- Petty cash and wallets, client invoices and reports, subcontractor work orders and RA bills.
- Issues and checklists, drawings, chat, Tally export.
- AI estimation and planning, and 0% material credit.
- Apps in 8–10 Indian languages. Store reviews praise their onboarding and support staff.

**Not advertised: offline use.** To verify only through a demo: offline mode, how attendance is captured, whether Tally is a sync or an export, and what the AI does.

**Takeaway.** Powerplay wins on breadth, proof, languages, sales staff and money. It is weak on speed, accessibility and copy quality, and it has a 7-field, no-WhatsApp demo form. It does not advertise offline use.

---

## 2. Alarsio today (honest)

**Site** (`apps/web/src/app/page.tsx`, copy in `lib/landing/content.ts`, `docs/DESIGN.md` v2.1):
- Pages: home, about, contact, download, privacy and terms.
- **Not there:** a pricing page, feature pages and an enquiry form.
- Contact is only `mailto:` and WhatsApp.

**Measured.**
- 452 KB over 20 requests. DOMContentLoaded at 2.8s, load at 3.2s.
- One H1, full JSON-LD (Organization, WebSite, SoftwareApplication, FAQPage), sitemap and OG image, accessible heatmap and menu.

**Our strengths vs Powerplay.**
- Offline-first.
- 6× lighter page.
- Accessible.
- One clear customer: 2–20 sites.
- Sample data is labelled as sample.
- WhatsApp is on the site.

**Our weaknesses.** Ranked in section 3.

---

## 3. Gaps and recommendations

Effort: S = under 1 day, M = 1–3 days, L = a week or more.
Tier: **E** = essential, **U** = useful, **F** = future.

### Branding and trust

| # | Powerplay | Ours | Why it matters | Recommendation | Effort | Priority | Tier |
|---|---|---|---|---|---|---|---|
| T1 | Logos, 23 testimonials, 8 case studies | No customers, no proof | Owners buy from people they trust | After the pilot: 1–2 named pilot stories (with permission), plus a "Built by" founder section with real names and photos now | S then M | Critical | E |
| T2 | Company name, CIN and office on every page | Legal entity only in `lib/site/legal.ts` | Shows a real business | Footer: registered name, city, phone, email | S | High | E |
| T3 | Play Store and App Store, 4.7★ | APK side-load from an EAS link | Side-loading looks unsafe to owners; Android warns about it | Publish to Play Store (internal testing, then production) | M | Critical | E |
| T4 | Phone number on the contact page | No phone number | You asked for call as a channel | Add a `tel:` link in the header, footer and contact page | S | High | E |
| T5 | "No trackers" not claimed | Home page says no third-party scripts, but GA loads after consent (#193) | A false claim damages trust | Reword the claim, or drop GA. **Your decision.** | S | High | E |
| T6 | Lawyer-grade legal pages (assumed) | Privacy and terms not reviewed by a lawyer | Needed before paid customers | Legal review | M (cost) | Medium | U |

### Marketing and customer acquisition

| # | Powerplay | Ours | Why | Recommendation | Effort | Priority | Tier |
|---|---|---|---|---|---|---|---|
| M1 | Demo CTA everywhere | Main CTA is open sign-up | You chose hybrid | Main CTA "Book a demo", second CTA "Start free pilot", plus WhatsApp and Call | S | Critical | E |
| M2 | 7-field demo form, no promise | No form | Leads currently depend on an email client | 4-field enquiry form (section 5), then a thank-you page promising a reply in 5 hours | M | Critical | E |
| M3 | 13 use-case and 5 persona pages | One home page | Search traffic and clear messaging | 4 feature pages (Attendance, Daily report, Materials, Wages) and 3 role pages | M | High | U |
| M4 | Blog, templates, calculators | None | Cheap long-term SEO | 3 free tools: labour attendance sheet template, wage calculator, DPR template | M | Medium | U |
| M5 | Hindi ad page; app in 8+ languages | English only | Supervisors read Hindi | Hindi landing page first, Hindi in the app later | M / L | High | U / F |
| M6 | Press, funding news | None | Not affordable now | Skip | – | Low | F |

### Product features (all post-MVP; each needs an ADR, CLAUDE.md rule 4)

| # | Powerplay | Ours | Recommendation | Priority | Tier |
|---|---|---|---|---|---|
| P0 | – | **All nine modules still marked 🟡 in FEATURES.md** | Finish and smoke-test the MVP (your current focus) | Critical | E |
| P1 | Site expenses / petty cash | None | Most-asked feature by small contractors. First post-MVP candidate | High | F |
| P2 | DPR shared on WhatsApp | Report in the app only | "Share report as PDF/image to WhatsApp" (share sheet, no API) | High | F |
| P3 | Material indent → PO → GRN | Stock in/out only | Keep it simple. Add a "material request" first | Medium | F |
| P4 | Issues, checklists, drawings, chat | None | Not now | Low | F |
| P5 | Tally export | CSV only (if any) | Tally-ready CSV for wages | Medium | F |
| P6 | Client reports and invoices | None | Later | Low | F |
| P7 | 8–10 app languages | English | Hindi in the mobile app | High | F |
| P8 | AI estimation, credit | None | Do not chase this | – | – |

### UX and workflows

| # | Powerplay | Ours | Why | Recommendation | Effort | Priority | Tier |
|---|---|---|---|---|---|---|---|
| U1 | – | All-caps Anton headlines | All-caps text is slower to read on phones | Test sentence case in the prototypes | S | Medium | U |
| U2 | No WhatsApp | WhatsApp only on the contact page | Indian buyers prefer WhatsApp | Sticky WhatsApp/Call button on mobile | S | High | E |
| U3 | Videos of product | Ad video plus HTML mocks | Real screens build belief | Real (anonymised) app screenshots once the MVP is stable | S | High | U |

### Technical, performance and mobile

| # | Finding | Recommendation | Effort | Tier |
|---|---|---|---|---|
| X1 | Our site is already faster and more accessible than Powerplay's | Keep the rules in DESIGN.md §3 (Lighthouse 90+, 48px targets, no zoom lock) | – | E |
| X2 | Lighthouse mobile has never been run (PR #185 note) | Run it before and after the redesign | S | E |
| X3 | No lead capture backend | See section 5 | M | E |
| X4 | No analytics plan beyond GA | Use UTM tags on demo CTAs (as Powerplay does), read in GA if kept | S | U |
| X5 | Marketing components in `components/landing` and `components/site` | Reuse them. Add `components/site/enquiry-form.tsx`. No new framework | – | E |

---

## 4. Customer-acquisition strategy (no budget, no customers)

| Approach | Pros | Cons | Fit now |
|---|---|---|---|
| Open sign-up | No staff needed | Empty accounts, no learning, support load | Keep as the second option |
| **Book a demo / enquiry** | You learn each customer's need, and personal setup builds trust | Takes your time | **Main CTA** |
| WhatsApp / Call | Lowest effort for buyers | Hard to track | Always visible |
| Free trial (time-limited) | Creates urgency | Needs billing | After pricing goes live |
| Invite-only pilot | Quality feedback | Slow | Effectively what "pilot" means |

**Plan:**
1. Personally onboard 5–10 contractors in 1–2 cities through your network, local builder associations, hardware and cement dealers, and WhatsApp groups.
2. Set up their sites for them.
3. After 30 days, ask for a quote, a logo and one number (for example "wage sheet in 10 min instead of 2 days").
4. Use these as proof on the site.

Paid ads only once the demo-to-pilot conversion is known.

---

## 5. Enquiry form (to build after 15 Nov)

**Fields (4 required, 2 optional):**
1. Name (required)
2. Mobile, `type=tel` with +91 (required)
3. City (required)
4. Number of active sites: 1 / 2–5 / 6–10 / 11–20 / 20+ (required)
5. Company name (optional)
6. Preferred contact: WhatsApp / Call (optional, default WhatsApp)

No email or turnover required: these buyers live on phones.

**After submit:**
- Thank-you state: "Got it. We'll WhatsApp you within 5 hours (9am–8pm IST)."
- Also offer an instant "Message us on WhatsApp now" button with a prefilled text.

**Delivery to you (decision needed):**
- **Option A (recommended):** a Next.js server action emails you through a transactional mail service (for example Resend's free tier). No new table, no new module. The landing page keeps "owns no table".
- **Option B:** a `leads` table in Supabase. This needs an ADR and a module owner. Not recommended for now.

**Guards:** honeypot field, server-side validation, a simple rate limit, no data in URLs.

---

## 6. Design prototypes (after 15 Nov, before any build)

Four working HTML samples. Each is responsive, uses our real copy, and includes: a home page, the enquiry form with a thank-you state, the mobile menu and a sticky WhatsApp/Call bar.

Folder: `design-samples/2026-11-homepage/` at the repo root, not inside `apps/`.

| File | Direction |
|---|---|
| `a-editorial-refined.html` | Keeps today's cream/ink/red identity and adds sentence-case headings, a demo CTA and a proof strip. Smallest change. |
| `b-clean-saas.html` | White background, one brand colour, sans-serif, screenshots in device frames. The "market standard" look, closest to Powerplay but faster. |
| `c-field-first.html` | Phone-first, Hindi/English toggle, WhatsApp as the main CTA, large type for supervisors and owners. |
| `d-demo-led.html` | A short landing page with the enquiry form in the hero, then 3 benefits, proof and FAQ. Ad-landing style. |

You compare them locally and pick one, or a mix. Only then do I build.

**Decisions waiting for you then:**
1. Which design direction.
2. GA: keep it and reword the claim, or remove it.
3. Lead delivery: option A or B.
4. Reply-hours wording.
5. Show founder names and photos?
6. Hindi page: yes or no.

---

## 7. Roadmap

**Phase 0: now until 15 Nov (MVP only).**
- No website or feature work.
- The only action from this plan: save this report as `docs/research/powerplay-2026-11.md` and add one roadmap line under "Web landing page" in `docs/FEATURES.md`:
  > Post-MVP: raise the website to Powerplay-level polish (demo-first, enquiry form, proof). See docs/research/powerplay-2026-11.md.
- Uncommitted; I ask before any commit.

**Phase 1: week of 16 Nov (essential, about 1 week).**
1. Build the 4 prototypes. You choose.
2. Implement the chosen direction on the home page.
3. Demo CTA and enquiry form (option A), thank-you state.
4. Sticky WhatsApp and Call buttons, phone number in the header, footer and contact page (T4, U2).
5. Company details in the footer (T2).
6. Fix the GA claim (T5).
7. Founder section (T1, first part).
8. Lighthouse before and after (X2).

**Phase 2: weeks 2–4 (useful).**
- Play Store listing (T3).
- 4 feature pages and 3 role pages (M3).
- Real app screenshots (U3).
- UTM tags (X4).
- Hindi landing page (M5).

**Phase 3: after the first pilots (future).**
- Pilot case studies and logos (T1).
- Free templates and calculator (M4).
- Petty cash, WhatsApp report sharing and Hindi in the app (P1, P2, P7), each through spec → ADR → PR.
- Legal review (T6).
- Pricing page when you decide to publish prices.

**Not recommended:** AI features, credit, a full procurement chain, and a press push.

---

## Verification (for Phases 1–2)
- `pnpm typecheck`, `pnpm lint`, `pnpm test --filter=web` (the copy-rule tests in `lib/landing/content.test.ts`).
- Preview with the browser pane at 375px, 768px and desktop: no horizontal scroll, tap targets ≥ 48px, one H1.
- Enquiry form:
  - Empty, invalid and valid submissions.
  - Honeypot rejects bots.
  - A real test enquiry arrives in your inbox.
  - The thank-you state shows.
  - The WhatsApp and tel links open correctly.
- Lighthouse mobile ≥ 90 on Performance, Accessibility, Best Practices and SEO; numbers recorded in the PR.
- Ask before every commit, push and PR. No attribution lines.
